-- Pagos divididos, descuentos autorizados y conciliación de devoluciones en caja.
-- Requiere las migraciones 001 y 003. Se conserva register_pos_sale para compatibilidad interna.

create or replace function public.register_pos_sale_v2(
  p_request_key uuid, p_employee_id uuid, p_items jsonb, p_payment_lines jsonb,
  p_discount numeric, p_cash_session_id bigint
) returns table (sale_id bigint, total numeric, repeated boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sale_id bigint; v_gross numeric(12,2); v_net numeric(12,2); v_repeated boolean;
  v_method_count integer; v_single_method text; v_paid numeric(12,2); v_line record;
begin
  if p_employee_id is null or p_request_key is null or jsonb_typeof(p_payment_lines) is distinct from 'array'
     or jsonb_array_length(p_payment_lines) not between 1 and 4 or p_discount is null or p_discount < 0 or p_discount > 100000000 then
    raise exception 'Datos de cobro inválidos' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payment_lines) as x(method text, amount numeric)
     where method not in ('efectivo', 'tarjeta', 'transferencia', 'otro') or amount is null or amount <= 0 or amount > 1000000000
  ) then raise exception 'Detalle de pagos inválido' using errcode = '22023'; end if;
  if (select count(distinct method) from jsonb_to_recordset(p_payment_lines) as x(method text, amount numeric))
     <> (select count(*) from jsonb_to_recordset(p_payment_lines) as x(method text, amount numeric)) then
    raise exception 'No repitas el mismo medio de pago' using errcode = '22023';
  end if;
  perform 1 from public.cash_sessions where id = p_cash_session_id and status = 'abierta' for update;
  if not found then raise exception 'Abrí una caja antes de registrar ventas' using errcode = '23514'; end if;

  select s.id, s.total, true into v_sale_id, v_gross, v_repeated from public.sales s where s.request_key = p_request_key;
  if v_sale_id is not null then
    if (select employee_id from public.sales where id = v_sale_id) <> p_employee_id then raise exception 'Clave de operación no autorizada' using errcode = '42501'; end if;
    return query select v_sale_id, v_gross, true;
    return;
  end if;
  select result.sale_id, result.total, result.repeated into v_sale_id, v_gross, v_repeated
    from public.register_pos_sale(p_request_key, p_employee_id, 'otro', p_items) as result;
  if v_repeated then return query select v_sale_id, v_gross, true; return; end if;
  if p_discount > v_gross then raise exception 'El descuento supera el importe de la venta' using errcode = '22023'; end if;
  v_net := v_gross - p_discount;
  select coalesce(sum(amount), 0)::numeric(12,2), count(distinct method), min(method)
    into v_paid, v_method_count, v_single_method
    from jsonb_to_recordset(p_payment_lines) as x(method text, amount numeric);
  if v_net <= 0 or v_paid <> v_net then raise exception 'Los pagos deben cubrir exactamente el total final' using errcode = '22023'; end if;
  update public.sales set total = v_net, discount = p_discount, cash_session_id = p_cash_session_id,
    payment_method = case when v_method_count = 1 then v_single_method else 'otro' end where id = v_sale_id;
  for v_line in select method, amount from jsonb_to_recordset(p_payment_lines) as x(method text, amount numeric)
  loop insert into public.sale_payments(sale_id, method, amount) values (v_sale_id, v_line.method, v_line.amount); end loop;
  return query select v_sale_id, v_net, false;
end;
$$;

create or replace function public.reverse_pos_sale_v2(p_sale_id bigint, p_responsible_id uuid, p_new_status text, p_reason text)
returns table (sale_id bigint, status text, repeated boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sale_status text; v_cash_refund numeric(12,2); v_result record; v_open_session bigint;
begin
  select sales.status into v_sale_status from public.sales where sales.id = p_sale_id for update;
  if not found then raise exception 'Venta inexistente' using errcode = 'P0002'; end if;
  if v_sale_status = p_new_status then return query select p_sale_id, v_sale_status, true; return; end if;
  if v_sale_status <> 'completada' then raise exception 'La venta ya fue revertida' using errcode = '23514'; end if;
  select coalesce(sum(amount), 0) into v_cash_refund from public.sale_payments where sale_id = p_sale_id and method = 'efectivo';
  if v_cash_refund > 0 then
    select id into v_open_session from public.cash_sessions where status = 'abierta' order by opened_at desc limit 1 for update;
    if v_open_session is null then raise exception 'Abrí una caja para registrar la devolución en efectivo' using errcode = '23514'; end if;
  end if;
  select * into v_result from public.reverse_pos_sale(p_sale_id, p_responsible_id, p_new_status, p_reason);
  if not v_result.repeated and v_cash_refund > 0 then
    insert into public.cash_movements(session_id, kind, amount, reason, sale_id, responsible_id)
    values (v_open_session, 'devolucion', v_cash_refund, 'Devolución en efectivo de venta #' || p_sale_id || ': ' || trim(p_reason), p_sale_id, p_responsible_id);
  end if;
  return query select v_result.sale_id, v_result.status, v_result.repeated;
end;
$$;

revoke all on function public.register_pos_sale_v2(uuid, uuid, jsonb, jsonb, numeric, bigint) from public, anon, authenticated;
revoke all on function public.reverse_pos_sale_v2(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_pos_sale_v2(uuid, uuid, jsonb, jsonb, numeric, bigint) to service_role;
grant execute on function public.reverse_pos_sale_v2(bigint, uuid, text, text) to service_role;
