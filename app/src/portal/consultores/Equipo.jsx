import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTable } from '../../lib/data.js';
import { NORMA_BY_ID } from '../../lib/calcEngine.js';
import { ROL_LABEL } from '../../lib/permisos.js';

// El equipo se deriva de los ACCESOS (perfiles con login). Esta pestaña es de
// solo lectura: para dar de alta, cambiar rol/nivel o quitar a alguien, se usa
// el panel de Accesos (invitación). Así equipo y accesos son siempre lo mismo.
export default function Equipo() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);

  useEffect(() => { listTable('consultores').then(setRows).catch(() => setRows([])); }, []);

  if (!rows) return <p className="font-semibold text-navy-400">Cargando…</p>;
  const nombreCompleto = (c) => [c.nombre, c.apellidos].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Organización</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Equipo</h1>
          <p className="mt-1 text-sm font-medium text-navy-400">El equipo se deriva de los miembros con acceso. Para dar de alta o modificar, usa Accesos.</p>
        </div>
        <button onClick={() => navigate('/consultores/accesos')} className="btn-primary !px-4 !py-2 text-sm">Gestionar en Accesos →</button>
      </div>

      <div className="rounded-xl bg-brand-orange/10 p-3 text-xs font-semibold text-brand-orangeDark">
        Un miembro del equipo existe solo si tiene acceso. Las altas, bajas, roles y niveles se gestionan al invitar desde Accesos.
      </div>

      {rows.length === 0 ? (
        <div className="card"><p className="text-sm font-medium text-navy-400">Aún no hay miembros de equipo con acceso. Invita al primero desde Accesos.</p></div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 bg-navy-50/50 text-left text-xs font-bold uppercase tracking-wide text-navy-400">
                <th className="px-5 py-3">Miembro</th>
                <th className="px-3 py-3">Rol</th>
                <th className="px-3 py-3">Nivel</th>
                <th className="px-3 py-3">Normas</th>
                <th className="px-3 py-3 text-right">Capacidad</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-b border-navy-50 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-bold text-navy-900">{nombreCompleto(c) || '—'}</div>
                    <div className="text-xs text-navy-400">{c.email || ''}</div>
                  </td>
                  <td className="px-3 py-3 text-navy-600">{ROL_LABEL[c.rol] || c.rol || '—'}</td>
                  <td className="px-3 py-3">{c.nivel ? <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-bold text-navy-600">{c.nivel}</span> : '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.normas || []).length ? c.normas.map(n => <span key={n} className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-bold text-navy-500">{NORMA_BY_ID[n]?.id || n}</span>) : <span className="text-navy-300">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-navy-600">{c.capacidad_clientes ?? '—'}</td>
                  <td className="px-3 py-3">{c.activo ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">Activo</span> : <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-bold text-navy-500">Inactivo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
