// Presenta proyectos, fases y tareas persistidos y permite trabajar tareas según el rol.
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import ActionModal from '../components/ActionModal.jsx';

const api = import.meta.env.VITE_API_URL || '/api/v1';
async function request(path, token, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

export default function ProjectsPage() {
  const auth = useAuth();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [historyByProject, setHistoryByProject] = useState({});
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [observationTask, setObservationTask] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingProject, setArchivingProject] = useState(null);
  const [editingPhase, setEditingPhase] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [deletingPhase, setDeletingPhase] = useState(null);
  const [deletingTask, setDeletingTask] = useState(null);

  // Carga proyectos y tareas persistidos; la API limita las filas a proyectos propios o tareas asignadas.
  async function load() {
    const token = await auth.getAccessToken();
    const taskQuery = new URLSearchParams();
    if (status) taskQuery.set('status', status);
    if (priority) taskQuery.set('priority', priority);
    if (showArchived && auth.role === 'administrador') taskQuery.set('includeArchived', 'true');
    const [projectRows, taskRows] = await Promise.all([
      request(`/projects${showArchived && auth.role === 'administrador' ? '?includeArchived=true' : ''}`, token), request(`/tasks?${taskQuery}`, token),
    ]);
    setProjects(projectRows);
    setTasks(taskRows);
    if (auth.role === 'administrador') setEmployees(await request('/employees', token));
  }

  useEffect(() => {
    if (!auth.user || !auth.roleReady || !['administrador', 'empleado'].includes(auth.role)) return;
    let active = true;
    load().catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [auth.user, auth.role, auth.roleReady, status, priority, showArchived]);

  // Crea un proyecto real asignado a un empleado activo obtenido desde el backend.
  async function createProject(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      const token = await auth.getAccessToken();
      await request('/projects', token, { method: 'POST', body: JSON.stringify({
        name: form.get('name'), objective: form.get('objective'), description: form.get('description'),
        ownerId: form.get('ownerId'), startDate: form.get('startDate') || null, dueDate: form.get('dueDate') || null,
        priority: form.get('priority'),
      }) });
      formElement.reset();
      setNotice('Proyecto creado.');
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  // Asigna una nueva tarea a una persona habilitada y vuelve a leer el avance calculado por tareas completadas.
  async function createTask(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      const token = await auth.getAccessToken();
      await request(`/projects/${form.get('projectId')}/tasks`, token, { method: 'POST', body: JSON.stringify({
        title: form.get('title'), description: form.get('description'), assigneeId: form.get('assigneeId') || null,
        phaseId: Number(form.get('phaseId')) || null, dueDate: form.get('dueDate') || null, priority: form.get('priority'),
      }) });
      formElement.reset();
      setNotice('Tarea creada y asignada.');
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  // Agrega una fase asociada al proyecto indicado para representar sus etapas reales.
  async function createPhase(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      const token = await auth.getAccessToken();
      await request(`/projects/${form.get('projectId')}/phases`, token, { method: 'POST', body: JSON.stringify({ name: form.get('name'), description: form.get('description'), startDate: form.get('startDate') || null, dueDate: form.get('dueDate') || null }) });
      formElement.reset();
      setNotice('Fase creada.');
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  // Permite que empleados actualicen estado y observaciones de sus tareas asignadas.
  async function updateTask(taskId, field, value) {
    setError('');
    try {
      const token = await auth.getAccessToken();
      await request(`/tasks/${taskId}`, token, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
      setNotice('Tarea actualizada.');
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  // Carga cambios auditados de un proyecto cuando la persona elige consultar su bitácora.
  async function showHistory(projectId) {
    try {
      const token = await auth.getAccessToken();
      const rows = await request(`/projects/${projectId}/history`, token);
      setHistoryByProject((current) => ({ ...current, [projectId]: rows }));
    } catch (requestError) { setError(requestError.message); }
  }

  // Permite a administración mantener el estado de proyecto alineado con el trabajo real.
  async function updateProject(project, nextStatus) {
    try {
      const token = await auth.getAccessToken();
      await request(`/projects/${project.id}`, token, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      setNotice('Estado del proyecto actualizado.');
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function archiveProject() {
    if (!archivingProject) return;
    try {
      const token = await auth.getAccessToken();
      await request(`/projects/${archivingProject.id}`, token, { method: 'PATCH', body: JSON.stringify({ archived: !archivingProject.archived_at }) });
      setNotice(archivingProject.archived_at ? 'Proyecto restaurado.' : 'Proyecto archivado; se conservó la bitácora.');
      setArchivingProject(null); await load();
    } catch (requestError) { setError(requestError.message); }
  }

  // Permite editar los campos que ya valida y persiste la API de proyectos.
  async function saveProject(event) {
    event.preventDefault();
    if (!editingProject || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(''); setNotice('');
    try {
      const token = await auth.getAccessToken();
      await request(`/projects/${editingProject.id}`, token, { method: 'PATCH', body: JSON.stringify({
        name: form.get('name'), objective: form.get('objective'), description: form.get('description'),
        ownerId: form.get('ownerId'), startDate: form.get('startDate') || null, dueDate: form.get('dueDate') || null,
        priority: form.get('priority'), status: form.get('status'),
      }) });
      setEditingProject(null);
      setNotice('Proyecto actualizado y registrado en la bitácora.');
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function savePhase(event) {
    event.preventDefault(); if (!editingPhase) return;
    const form = new FormData(event.currentTarget);
    try {
      const token = await auth.getAccessToken();
      await request(`/projects/${editingPhase.projectId}/phases/${editingPhase.id}`, token, { method: 'PATCH', body: JSON.stringify({ name: form.get('name'), description: form.get('description'), startDate: form.get('startDate') || null, dueDate: form.get('dueDate') || null, position: Number(form.get('position')) || 0 }) });
      setEditingPhase(null); setNotice('Fase actualizada.'); await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function removePhase() {
    if (!deletingPhase) return;
    try { const token = await auth.getAccessToken(); await request(`/projects/${deletingPhase.projectId}/phases/${deletingPhase.id}`, token, { method: 'DELETE' }); setDeletingPhase(null); setNotice('Fase eliminada; las tareas vinculadas quedaron sin fase.'); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function saveTask(event) {
    event.preventDefault(); if (!editingTask) return;
    const form = new FormData(event.currentTarget);
    try {
      const token = await auth.getAccessToken();
      await request(`/tasks/${editingTask.id}`, token, { method: 'PATCH', body: JSON.stringify({ title: form.get('title'), description: form.get('description'), assignee_id: form.get('assigneeId') || null, due_date: form.get('dueDate') || null, priority: form.get('priority'), status: form.get('status') }) });
      setEditingTask(null); setNotice('Tarea actualizada.'); await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function removeTask() {
    if (!deletingTask) return;
    try { const token = await auth.getAccessToken(); await request(`/tasks/${deletingTask.id}`, token, { method: 'DELETE' }); setDeletingTask(null); setNotice('Tarea eliminada; su acción quedó registrada en la bitácora.'); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  // Registra observaciones del empleado mediante la misma ruta protegida que actualiza sus tareas.
  async function saveObservation(observations) { if (!observationTask) return; await updateTask(observationTask.id, 'observations', observations); setObservationTask(null); }

  return <main className="staff-page admin-content"><div className="staff-page-heading"><div><p className="section-eyebrow">ORGANIZACIÓN INTERNA</p><h1>Proyectos y tareas</h1><p>El progreso se calcula sobre las tareas que figuran como completadas.</p></div>{auth.role === 'administrador' && <label className="admin-check-label"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivados</label>}</div>
    {error && <p className="react-form-error" role="alert">{error}</p>}{notice && <p className="react-form-success" role="status">{notice}</p>}
    <div className="staff-filters"><label>Estado de tarea<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="bloqueada">Bloqueada</option><option value="completada">Completada</option></select></label><label>Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option>{['baja', 'media', 'alta', 'urgente'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <section className="projects-grid">{projects.map((project) => <article className="staff-card project-card" key={project.id}><div className="project-title-row"><h2>{project.name}</h2>{auth.role === 'administrador' ? <select aria-label={`Estado de ${project.name}`} value={project.status} onChange={(event) => updateProject(project, event.target.value)}>{['planificacion', 'pendiente', 'en_curso', 'pausado', 'completado', 'cancelado'].map((item) => <option key={item}>{item}</option>)}</select> : <span>{project.status}</span>}</div><p>{project.objective}</p><p>Responsable: {project.owner_id}</p><p>Prioridad: {project.priority} · Vence: {project.due_date || 'Sin fecha'}</p><div className="project-progress"><span style={{ width: `${project.progress}%` }} /><strong>{project.progress}%</strong></div>{project.overdueTasks > 0 && <p className="react-form-error">Tareas vencidas: {project.overdueTasks}</p>}<div className="project-phases">{(project.project_phases || []).map((phase) => <span className="project-phase-item" key={phase.id}>{phase.name}{auth.role === 'administrador' && <><button type="button" onClick={() => setEditingPhase({ ...phase, projectId: project.id })} aria-label={`Editar fase ${phase.name}`}>Editar</button><button type="button" onClick={() => setDeletingPhase({ ...phase, projectId: project.id })} aria-label={`Eliminar fase ${phase.name}`}>Eliminar</button></>}</span>)}</div>{auth.role === 'administrador' && <><button className="react-remove" onClick={() => setEditingProject(project)}>Editar proyecto</button><button className="react-remove" onClick={() => setArchivingProject(project)}>{project.archived_at ? 'Restaurar proyecto' : 'Archivar proyecto'}</button></>}<button className="react-remove" onClick={() => showHistory(project.id)}>Ver historial</button>{historyByProject[project.id] && <ul className="project-history">{historyByProject[project.id].map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>{new Date(entry.created_at).toLocaleString('es-AR')}</span></li>)}</ul>}</article>)}</section>
    {projects.length === 0 && <p className="staff-empty">No hay proyectos asignados o registrados.</p>}
    <section className="staff-card"><h2>{auth.role === 'administrador' ? 'Tareas del equipo' : 'Mis tareas asignadas'}</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Tarea</th><th>Proyecto</th><th>Fase</th><th>Responsable</th><th>Vencimiento</th><th>Prioridad</th><th>Estado</th><th>Notas</th>{auth.role === 'administrador' && <th>Acciones</th>}</tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.title}</td><td>{task.projects?.name}</td><td>{task.project_phases?.name || '—'}</td><td>{task.assignee_id || 'Sin asignar'}</td><td>{task.due_date || '—'}</td><td>{task.priority}</td><td><select value={task.status} onChange={(event) => updateTask(task.id, 'status', event.target.value)}><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="bloqueada">Bloqueada</option><option value="completada">Completada</option></select></td><td><button className="react-remove" onClick={() => setObservationTask(task)}>Observación</button></td>{auth.role === 'administrador' && <td><button className="admin-action-button" onClick={() => setEditingTask(task)}>Editar</button><button className="admin-action-button" onClick={() => setDeletingTask(task)}>Eliminar</button></td>}</tr>)}</tbody></table></div>{tasks.length === 0 && <p className="staff-empty">No hay tareas para estos filtros.</p>}</section>
    {auth.role === 'administrador' && <div className="project-admin-forms"><section className="staff-card"><h2>Crear proyecto</h2><form className="staff-form project-form" onSubmit={createProject}><label>Nombre<input name="name" minLength="2" maxLength="160" required /></label><label>Objetivo<input name="objective" required /></label><label>Descripción<input name="description" /></label><label>Responsable<select name="ownerId" required><option value="">Elegí empleado</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre} {employee.apellido} · {employee.email}</option>)}</select></label><label>Inicio<input name="startDate" type="date" /></label><label>Vencimiento<input name="dueDate" type="date" /></label><label>Prioridad<select name="priority"><option value="media">Media</option><option value="baja">Baja</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><button className="btn btn-primary" disabled={busy}>CREAR PROYECTO</button></form></section>
      <section className="staff-card"><h2>Crear fase</h2><form className="staff-form project-form" onSubmit={createPhase}><label>Proyecto<select name="projectId" required>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Nombre<input name="name" minLength="2" maxLength="160" required /></label><label>Descripción<input name="description" /></label><label>Inicio<input name="startDate" type="date" /></label><label>Vencimiento<input name="dueDate" type="date" /></label><button className="btn btn-primary" disabled={busy}>CREAR FASE</button></form></section>
      <section className="staff-card"><h2>Crear tarea</h2><form className="staff-form project-form" onSubmit={createTask}><label>Proyecto<select name="projectId" required>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Fase<select name="phaseId"><option value="">Sin fase</option>{projects.flatMap((project) => (project.project_phases || []).map((phase) => <option key={phase.id} value={phase.id}>{project.name} · {phase.name}</option>))}</select></label><label>Título<input name="title" minLength="2" maxLength="200" required /></label><label>Descripción<input name="description" /></label><label>Responsable<select name="assigneeId"><option value="">Sin asignar</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre} {employee.apellido}</option>)}</select></label><label>Vencimiento<input name="dueDate" type="date" /></label><label>Prioridad<select name="priority"><option value="media">Media</option><option value="baja">Baja</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><button className="btn btn-primary" disabled={busy}>CREAR TAREA</button></form></section></div>}
    {editingProject && <div className="react-scrim" onClick={() => setEditingProject(null)}><section className="react-form-dialog" role="dialog" aria-modal="true" aria-labelledby="project-edit-title" onClick={(event) => event.stopPropagation()}><button className="react-modal-close" onClick={() => setEditingProject(null)} aria-label="Cerrar edición">×</button><h2 id="project-edit-title">Editar proyecto</h2><form className="staff-form project-form" onSubmit={saveProject}><label>Nombre<input name="name" minLength="2" maxLength="160" defaultValue={editingProject.name} required /></label><label>Objetivo<input name="objective" maxLength="2000" defaultValue={editingProject.objective} required /></label><label>Descripción<input name="description" maxLength="4000" defaultValue={editingProject.description} /></label><label>Responsable<select name="ownerId" defaultValue={editingProject.owner_id} required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre} {employee.apellido} · {employee.email}</option>)}</select></label><label>Inicio<input name="startDate" type="date" defaultValue={editingProject.start_date || ''} /></label><label>Vencimiento<input name="dueDate" type="date" defaultValue={editingProject.due_date || ''} /></label><label>Prioridad<select name="priority" defaultValue={editingProject.priority}>{['baja', 'media', 'alta', 'urgente'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Estado<select name="status" defaultValue={editingProject.status}>{['planificacion', 'pendiente', 'en_curso', 'pausado', 'completado', 'cancelado'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="btn btn-primary btn-full" disabled={busy}>{busy ? 'GUARDANDO…' : 'GUARDAR PROYECTO'}</button></form></section></div>}
    <ActionModal open={Boolean(observationTask)} mode="prompt" title="Observación de tarea" description={observationTask ? `Agregá o modificá la observación de “${observationTask.title}”.` : ''} initialValue={observationTask?.observations || ''} placeholder="Escribí una observación" confirmLabel="Guardar observación" onCancel={() => setObservationTask(null)} onConfirm={saveObservation} />
    {editingPhase && <div className="react-scrim" onClick={() => setEditingPhase(null)}><section className="react-form-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-phase-title" onClick={(event) => event.stopPropagation()}><button className="react-modal-close" onClick={() => setEditingPhase(null)} aria-label="Cerrar">×</button><h2 id="edit-phase-title">Editar fase</h2><form className="staff-form project-form" onSubmit={savePhase} key={editingPhase.id}><label>Nombre<input name="name" defaultValue={editingPhase.name} minLength="2" maxLength="160" required /></label><label>Descripción<input name="description" defaultValue={editingPhase.description || ''} maxLength="4000" /></label><label>Inicio<input name="startDate" type="date" defaultValue={editingPhase.start_date || ''} /></label><label>Vencimiento<input name="dueDate" type="date" defaultValue={editingPhase.due_date || ''} /></label><label>Orden<input name="position" type="number" defaultValue={editingPhase.position || 0} /></label><button className="btn btn-primary btn-full">GUARDAR FASE</button></form></section></div>}
    {editingTask && <div className="react-scrim" onClick={() => setEditingTask(null)}><section className="react-form-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-task-title" onClick={(event) => event.stopPropagation()}><button className="react-modal-close" onClick={() => setEditingTask(null)} aria-label="Cerrar">×</button><h2 id="edit-task-title">Editar tarea</h2><form className="staff-form project-form" onSubmit={saveTask} key={editingTask.id}><label>Título<input name="title" defaultValue={editingTask.title} minLength="2" maxLength="200" required /></label><label>Descripción<input name="description" defaultValue={editingTask.description || ''} maxLength="4000" /></label><label>Responsable<select name="assigneeId" defaultValue={editingTask.assignee_id || ''}><option value="">Sin asignar</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre} {employee.apellido}</option>)}</select></label><label>Vencimiento<input name="dueDate" type="date" defaultValue={editingTask.due_date || ''} /></label><label>Prioridad<select name="priority" defaultValue={editingTask.priority}>{['baja', 'media', 'alta', 'urgente'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Estado<select name="status" defaultValue={editingTask.status}>{['pendiente', 'en_curso', 'bloqueada', 'completada'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="btn btn-primary btn-full">GUARDAR TAREA</button></form></section></div>}
    <ActionModal open={Boolean(deletingTask)} title="Eliminar tarea" description={deletingTask ? `Se eliminará “${deletingTask.title}” y se guardará la acción en el historial del proyecto.` : ''} confirmLabel="Eliminar tarea" danger onCancel={() => setDeletingTask(null)} onConfirm={removeTask} />
    <ActionModal open={Boolean(deletingPhase)} title="Eliminar fase" description={deletingPhase ? `Se eliminará “${deletingPhase.name}”. Las tareas vinculadas se conservarán sin fase.` : ''} confirmLabel="Eliminar fase" danger onCancel={() => setDeletingPhase(null)} onConfirm={removePhase} />
    <ActionModal open={Boolean(archivingProject)} title={archivingProject?.archived_at ? 'Restaurar proyecto' : 'Archivar proyecto'} description={archivingProject ? `${archivingProject.name}. ${archivingProject.archived_at ? 'Volverá a la lista activa.' : 'Se ocultará de la lista activa y se mantendrán sus tareas e historial.'}` : ''} confirmLabel={archivingProject?.archived_at ? 'Restaurar' : 'Archivar'} danger={!archivingProject?.archived_at} onCancel={() => setArchivingProject(null)} onConfirm={archiveProject} />
  </main>;
}
