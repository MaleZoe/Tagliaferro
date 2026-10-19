// Presenta proyectos, fases y tareas persistidos y permite trabajar tareas según el rol.
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

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

  // Carga proyectos y tareas persistidos; la API limita las filas a proyectos propios o tareas asignadas.
  async function load() {
    const token = await auth.getAccessToken();
    const taskQuery = new URLSearchParams();
    if (status) taskQuery.set('status', status);
    if (priority) taskQuery.set('priority', priority);
    const [projectRows, taskRows] = await Promise.all([
      request('/projects', token), request(`/tasks?${taskQuery}`, token),
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
  }, [auth.user, auth.role, auth.roleReady, status, priority]);

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

  // Registra observaciones del empleado mediante la misma ruta protegida que actualiza sus tareas.
  async function addObservation(task) {
    const observations = window.prompt(`Observación para: ${task.title}`, task.observations || '');
    if (observations === null) return;
    await updateTask(task.id, 'observations', observations);
  }

  return <main className="staff-page"><div className="staff-page-heading"><div><p className="section-eyebrow">ORGANIZACIÓN INTERNA</p><h1>Proyectos y tareas</h1><p>El progreso se calcula sobre las tareas que figuran como completadas.</p></div></div>
    {error && <p className="react-form-error" role="alert">{error}</p>}{notice && <p className="react-form-success" role="status">{notice}</p>}
    <div className="staff-filters"><label>Estado de tarea<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="bloqueada">Bloqueada</option><option value="completada">Completada</option></select></label><label>Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option>{['baja', 'media', 'alta', 'urgente'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <section className="projects-grid">{projects.map((project) => <article className="staff-card project-card" key={project.id}><div className="project-title-row"><h2>{project.name}</h2>{auth.role === 'administrador' ? <select aria-label={`Estado de ${project.name}`} value={project.status} onChange={(event) => updateProject(project, event.target.value)}>{['planificacion', 'pendiente', 'en_curso', 'pausado', 'completado', 'cancelado'].map((item) => <option key={item}>{item}</option>)}</select> : <span>{project.status}</span>}</div><p>{project.objective}</p><p>Responsable: {project.owner_id}</p><p>Prioridad: {project.priority} · Vence: {project.due_date || 'Sin fecha'}</p><div className="project-progress"><span style={{ width: `${project.progress}%` }} /><strong>{project.progress}%</strong></div>{project.overdueTasks > 0 && <p className="react-form-error">Tareas vencidas: {project.overdueTasks}</p>}<div className="project-phases">{(project.project_phases || []).map((phase) => <span key={phase.id}>{phase.name}</span>)}</div>{auth.role === 'administrador' && <button className="react-remove" onClick={() => setEditingProject(project)}>Editar proyecto</button>}<button className="react-remove" onClick={() => showHistory(project.id)}>Ver historial</button>{historyByProject[project.id] && <ul className="project-history">{historyByProject[project.id].map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>{new Date(entry.created_at).toLocaleString('es-AR')}</span></li>)}</ul>}</article>)}</section>
    {projects.length === 0 && <p className="staff-empty">No hay proyectos asignados o registrados.</p>}
    <section className="staff-card"><h2>{auth.role === 'administrador' ? 'Tareas del equipo' : 'Mis tareas asignadas'}</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Tarea</th><th>Proyecto</th><th>Fase</th><th>Responsable</th><th>Vencimiento</th><th>Prioridad</th><th>Estado</th><th>Notas</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.title}</td><td>{task.projects?.name}</td><td>{task.project_phases?.name || '—'}</td><td>{task.assignee_id || 'Sin asignar'}</td><td>{task.due_date || '—'}</td><td>{task.priority}</td><td><select value={task.status} onChange={(event) => updateTask(task.id, 'status', event.target.value)}><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="bloqueada">Bloqueada</option><option value="completada">Completada</option></select></td><td><button className="react-remove" onClick={() => addObservation(task)}>Observación</button></td></tr>)}</tbody></table></div>{tasks.length === 0 && <p className="staff-empty">No hay tareas para estos filtros.</p>}</section>
    {auth.role === 'administrador' && <div className="project-admin-forms"><section className="staff-card"><h2>Crear proyecto</h2><form className="staff-form project-form" onSubmit={createProject}><label>Nombre<input name="name" minLength="2" maxLength="160" required /></label><label>Objetivo<input name="objective" required /></label><label>Descripción<input name="description" /></label><label>Responsable<select name="ownerId" required><option value="">Elegí empleado</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre} {employee.apellido} · {employee.email}</option>)}</select></label><label>Inicio<input name="startDate" type="date" /></label><label>Vencimiento<input name="dueDate" type="date" /></label><label>Prioridad<select name="priority"><option value="media">Media</option><option value="baja">Baja</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><button className="btn btn-primary" disabled={busy}>CREAR PROYECTO</button></form></section>
      <section className="staff-card"><h2>Crear fase</h2><form className="staff-form project-form" onSubmit={createPhase}><label>Proyecto<select name="projectId" required>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Nombre<input name="name" minLength="2" maxLength="160" required /></label><label>Descripción<input name="description" /></label><label>Inicio<input name="startDate" type="date" /></label><label>Vencimiento<input name="dueDate" type="date" /></label><button className="btn btn-primary" disabled={busy}>CREAR FASE</button></form></section>
      <section className="staff-card"><h2>Crear tarea</h2><form className="staff-form project-form" onSubmit={createTask}><label>Proyecto<select name="projectId" required>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Fase<select name="phaseId"><option value="">Sin fase</option>{projects.flatMap((project) => (project.project_phases || []).map((phase) => <option key={phase.id} value={phase.id}>{project.name} · {phase.name}</option>))}</select></label><label>Título<input name="title" minLength="2" maxLength="200" required /></label><label>Descripción<input name="description" /></label><label>Responsable<select name="assigneeId"><option value="">Sin asignar</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre} {employee.apellido}</option>)}</select></label><label>Vencimiento<input name="dueDate" type="date" /></label><label>Prioridad<select name="priority"><option value="media">Media</option><option value="baja">Baja</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label><button className="btn btn-primary" disabled={busy}>CREAR TAREA</button></form></section></div>}
    {editingProject && <div className="react-scrim" onClick={() => setEditingProject(null)}><section className="react-form-dialog" role="dialog" aria-modal="true" aria-labelledby="project-edit-title" onClick={(event) => event.stopPropagation()}><button className="react-modal-close" onClick={() => setEditingProject(null)} aria-label="Cerrar edición">×</button><h2 id="project-edit-title">Editar proyecto</h2><form className="staff-form project-form" onSubmit={saveProject}><label>Nombre<input name="name" minLength="2" maxLength="160" defaultValue={editingProject.name} required /></label><label>Objetivo<input name="objective" maxLength="2000" defaultValue={editingProject.objective} required /></label><label>Descripción<input name="description" maxLength="4000" defaultValue={editingProject.description} /></label><label>Responsable<select name="ownerId" defaultValue={editingProject.owner_id} required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre} {employee.apellido} · {employee.email}</option>)}</select></label><label>Inicio<input name="startDate" type="date" defaultValue={editingProject.start_date || ''} /></label><label>Vencimiento<input name="dueDate" type="date" defaultValue={editingProject.due_date || ''} /></label><label>Prioridad<select name="priority" defaultValue={editingProject.priority}>{['baja', 'media', 'alta', 'urgente'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Estado<select name="status" defaultValue={editingProject.status}>{['planificacion', 'pendiente', 'en_curso', 'pausado', 'completado', 'cancelado'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="btn btn-primary btn-full" disabled={busy}>{busy ? 'GUARDANDO…' : 'GUARDAR PROYECTO'}</button></form></section></div>}
  </main>;
}
