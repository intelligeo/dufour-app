/**
 * Admin.jsx – Pannello di gestione Dufour.app
 *
 * Struttura:
 *  - LoginForm        → richiede username/password, salva JWT in localStorage
 *  - AdminDashboard   → tab Utenti (CRUD) + tab Progetti (elenco + elimina)
 *  - UserDashboard    → tab I miei progetti + health check per singolo progetto
 */

import React, {createContext, useCallback, useContext, useEffect, useReducer, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';

// ---------------------------------------------------------------------------
// Costanti & Helpers
// ---------------------------------------------------------------------------
const API = '';          // stesso origin; in dev il proxy webpack rimappa /api → backend
const LS_KEY = 'dufour_admin_token';

function getToken()  { return localStorage.getItem(LS_KEY); }
function setToken(t) { localStorage.setItem(LS_KEY, t); }
function clearToken(){ localStorage.removeItem(LS_KEY); }

async function apiFetch(path, opts = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
        ...(opts.headers || {}),
    };
    const res = await fetch(`${API}${path}`, {...opts, headers});
    if (res.status === 401 || res.status === 403) {
        clearToken();
        window.location.reload();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
}

// Invia un form www-urlencoded (per OAuth2PasswordRequestForm del backend)
async function apiLogin(username, password) {
    const body = new URLSearchParams({username, password});
    const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;                // { access_token, token_type, role, username }
}

// Richiesta reset password (email)
async function apiForgotPassword(email) {
    const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
}

// Reset password con token
async function apiResetPassword(token, new_password) {
    const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token, new_password}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
}

// ---------------------------------------------------------------------------
// Context auth
// ---------------------------------------------------------------------------
const AuthCtx = createContext(null);

function AuthProvider({children}) {
    const [user, setUser] = useState(null);   // { username, role, email, id }
    const [loading, setLoading] = useState(true);

    // Al mount verifica se c'è già un token valido
    useEffect(() => {
        if (!getToken()) { setLoading(false); return; }
        apiFetch('/api/auth/me')
            .then(u => setUser(u))
            .catch(() => clearToken())
            .finally(() => setLoading(false));
    }, []);

    const login = useCallback(async (username, password) => {
        const data = await apiLogin(username, password);
        setToken(data.access_token);
        const me = await apiFetch('/api/auth/me');
        setUser(me);
    }, []);

    const logout = useCallback(() => {
        clearToken();
        setUser(null);
    }, []);

    return (
        <AuthCtx.Provider value={{user, loading, login, logout}}>
            {children}
        </AuthCtx.Provider>
    );
}

function useAuth() { return useContext(AuthCtx); }

// ---------------------------------------------------------------------------
// Styles (inline, nessuna dipendenza esterna)
// ---------------------------------------------------------------------------
const S = {
    page: {minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1e23'},
    header: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', background: '#242930', borderBottom: '1px solid #353a42',
    },
    logo: {fontWeight: 700, fontSize: 18, color: '#7cb9e8', letterSpacing: 1},
    user: {marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13},
    badge: {
        padding: '2px 8px', borderRadius: 10, background: '#354a6a', color: '#7cb9e8',
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    },
    btn: {
        cursor: 'pointer', border: 'none', borderRadius: 6,
        padding: '6px 14px', fontSize: 13, fontWeight: 500,
    },
    btnPrimary: {background: '#2563eb', color: '#fff'},
    btnDanger: {background: '#c0392b', color: '#fff'},
    btnSecondary: {background: '#353a42', color: '#d0d5db'},
    btnSmall: {padding: '3px 10px', fontSize: 12},

    // login
    loginWrap: {flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'},
    card: {
        background: '#242930', borderRadius: 12, padding: 36,
        width: 360, boxShadow: '0 8px 32px rgba(0,0,0,.5)',
    },
    h2: {margin: '0 0 24px', fontSize: 20, color: '#e2e8f0'},
    label: {display: 'block', fontSize: 12, marginBottom: 4, color: '#9ba3af'},
    input: {
        display: 'block', width: '100%', padding: '8px 12px',
        background: '#1a1e23', border: '1px solid #353a42', borderRadius: 6,
        color: '#e2e8f0', fontSize: 14, marginBottom: 16, outline: 'none',
    },
    error: {color: '#f87171', fontSize: 13, marginBottom: 12},

    // tabs
    tabs: {display: 'flex', gap: 0, borderBottom: '1px solid #353a42', margin: '0 24px'},
    tab: {
        padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 500,
        borderBottom: '2px solid transparent', color: '#9ba3af', userSelect: 'none',
    },
    tabActive: {color: '#7cb9e8', borderBottomColor: '#7cb9e8'},

    // table
    tableWrap: {overflowX: 'auto', margin: 24, borderRadius: 8, border: '1px solid #353a42'},
    table: {borderCollapse: 'collapse', width: '100%', fontSize: 13},
    th: {
        background: '#2d333b', padding: '10px 14px', textAlign: 'left',
        color: '#9ba3af', fontWeight: 600, borderBottom: '1px solid #353a42',
    },
    td: {padding: '9px 14px', borderBottom: '1px solid #2a2e36', verticalAlign: 'middle'},
    trHover: {background: '#242930'},

    // modal
    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    },
    modal: {background: '#242930', borderRadius: 10, padding: 28, width: 400, maxWidth: '90vw'},
    modalTitle: {margin: '0 0 18px', fontSize: 16, color: '#e2e8f0'},

    // health
    pill: (s) => ({
        display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11,
        fontWeight: 700, textTransform: 'uppercase',
        background: s === 'healthy' ? '#14532d' : s === 'degraded' ? '#78350f' : '#3b1a1a',
        color:      s === 'healthy' ? '#4ade80' : s === 'degraded' ? '#fbbf24' : '#f87171',
    }),
};

// ---------------------------------------------------------------------------
// Componenti atomici
// ---------------------------------------------------------------------------
function Btn({style, children, ...rest}) {
    return (
        <button style={{...S.btn, ...style}} {...rest}>{children}</button>
    );
}

function Modal({title, onClose, children}) {
    return (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={S.modal}>
                <h3 style={S.modalTitle}>{title}</h3>
                {children}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// LoginForm
// ---------------------------------------------------------------------------
function LoginForm({onForgot}) {
    const {login} = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true); setErr('');
        try { await login(username, password); }
        catch (ex) { setErr(ex.message); }
        finally { setBusy(false); }
    }

    return (
        <div style={S.loginWrap}>
            <div style={S.card}>
                <h2 style={S.h2}>Dufour.app – Gestione</h2>
                <form onSubmit={handleSubmit}>
                    <label style={S.label}>Username</label>
                    <input style={S.input} value={username}
                           onChange={e => setUsername(e.target.value)} autoFocus required />
                    <label style={S.label}>Password</label>
                    <input style={S.input} type="password" value={password}
                           onChange={e => setPassword(e.target.value)} required />
                    {err && <div style={S.error}>{err}</div>}
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px'}}
                         type="submit" disabled={busy}>
                        {busy ? 'Accesso…' : 'Accedi'}
                    </Btn>
                </form>
                <div style={{textAlign: 'center', marginTop: 16}}>
                    <span style={{fontSize: 13, color: '#7cb9e8', cursor: 'pointer',
                                  textDecoration: 'underline'}}
                          onClick={onForgot}>
                        Password dimenticata?
                    </span>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ForgotPasswordForm – richiesta email per reset
// ---------------------------------------------------------------------------
function ForgotPasswordForm({onBack}) {
    const [email, setEmail] = useState('');
    const [err, setErr]     = useState('');
    const [sent, setSent]   = useState(false);
    const [busy, setBusy]   = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setBusy(true); setErr('');
        try {
            await apiForgotPassword(email);
            setSent(true);
        } catch (ex) { setErr(ex.message); }
        finally { setBusy(false); }
    }

    if (sent) {
        return (
            <div style={S.loginWrap}>
                <div style={S.card}>
                    <h2 style={S.h2}>📧 Controlla la tua email</h2>
                    <p style={{color: '#9ba3af', fontSize: 14, lineHeight: 1.6}}>
                        Se l'indirizzo <strong style={{color: '#e2e8f0'}}>{email}</strong> è
                        associato a un account, riceverai un'email con un link per reimpostare
                        la password.
                    </p>
                    <p style={{color: '#9ba3af', fontSize: 13, marginTop: 12}}>
                        Il link è valido per 30 minuti. Controlla anche la cartella spam.
                    </p>
                    <Btn style={{...S.btnSecondary, width: '100%', padding: '9px', marginTop: 20}}
                         onClick={onBack}>
                        ← Torna al login
                    </Btn>
                </div>
            </div>
        );
    }

    return (
        <div style={S.loginWrap}>
            <div style={S.card}>
                <h2 style={S.h2}>Password dimenticata</h2>
                <p style={{color: '#9ba3af', fontSize: 13, marginBottom: 20}}>
                    Inserisci l'email associata al tuo account. Riceverai un link per reimpostare la password.
                </p>
                <form onSubmit={handleSubmit}>
                    <label style={S.label}>Email</label>
                    <input style={S.input} type="email" value={email}
                           onChange={e => setEmail(e.target.value)} autoFocus required
                           placeholder="nome@esempio.com" />
                    {err && <div style={S.error}>{err}</div>}
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px'}}
                         type="submit" disabled={busy}>
                        {busy ? 'Invio…' : 'Invia link di reset'}
                    </Btn>
                </form>
                <div style={{textAlign: 'center', marginTop: 16}}>
                    <span style={{fontSize: 13, color: '#7cb9e8', cursor: 'pointer',
                                  textDecoration: 'underline'}}
                          onClick={onBack}>
                        ← Torna al login
                    </span>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ResetPasswordForm – imposta nuova password con token dall'URL
// ---------------------------------------------------------------------------
function ResetPasswordForm({token, onDone}) {
    const [password, setPassword]   = useState('');
    const [confirm, setConfirm]     = useState('');
    const [err, setErr]             = useState('');
    const [success, setSuccess]     = useState(false);
    const [busy, setBusy]           = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        if (password !== confirm) { setErr('Le password non corrispondono'); return; }
        if (password.length < 6) { setErr('La password deve essere di almeno 6 caratteri'); return; }
        setBusy(true); setErr('');
        try {
            await apiResetPassword(token, password);
            setSuccess(true);
            // Pulisci il token dall'URL
            window.history.replaceState({}, '', '/admin');
        } catch (ex) { setErr(ex.message); }
        finally { setBusy(false); }
    }

    if (success) {
        return (
            <div style={S.loginWrap}>
                <div style={S.card}>
                    <h2 style={S.h2}>✅ Password reimpostata!</h2>
                    <p style={{color: '#9ba3af', fontSize: 14, lineHeight: 1.6}}>
                        La tua password è stata cambiata con successo.
                        Ora puoi accedere con la nuova password.
                    </p>
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px', marginTop: 20}}
                         onClick={onDone}>
                        Vai al login
                    </Btn>
                </div>
            </div>
        );
    }

    return (
        <div style={S.loginWrap}>
            <div style={S.card}>
                <h2 style={S.h2}>Nuova password</h2>
                <p style={{color: '#9ba3af', fontSize: 13, marginBottom: 20}}>
                    Scegli una nuova password per il tuo account.
                </p>
                <form onSubmit={handleSubmit}>
                    <label style={S.label}>Nuova password</label>
                    <input style={S.input} type="password" value={password}
                           onChange={e => setPassword(e.target.value)} autoFocus required
                           minLength={6} placeholder="Almeno 6 caratteri" />
                    <label style={S.label}>Conferma password</label>
                    <input style={S.input} type="password" value={confirm}
                           onChange={e => setConfirm(e.target.value)} required
                           minLength={6} placeholder="Ripeti la password" />
                    {err && <div style={S.error}>{err}</div>}
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px'}}
                         type="submit" disabled={busy}>
                        {busy ? 'Salvataggio…' : 'Reimposta password'}
                    </Btn>
                </form>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// UserModal – Creazione/modifica utente (solo admin)
// ---------------------------------------------------------------------------
function UserModal({user: initial, onSave, onClose}) {
    const isNew = !initial;
    const [form, setForm] = useState({
        username: initial?.username || '',
        email:    initial?.email    || '',
        role:     initial?.role     || 'user',
        password: '',
    });
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    function field(name) {
        return {
            value: form[name],
            onChange: e => setForm(f => ({...f, [name]: e.target.value})),
        };
    }

    async function handleSave() {
        setBusy(true); setErr('');
        try {
            const body = {...form};
            if (!isNew && !body.password) delete body.password;  // non cambiare pw se vuota
            if (isNew) {
                await apiFetch('/api/admin/users', {method: 'POST', body: JSON.stringify(body)});
            } else {
                await apiFetch(`/api/admin/users/${initial.id}`, {method: 'PATCH', body: JSON.stringify(body)});
            }
            onSave();
        } catch (ex) { setErr(ex.message); }
        finally { setBusy(false); }
    }

    return (
        <Modal title={isNew ? 'Nuovo utente' : `Modifica: ${initial.username}`} onClose={onClose}>
            <label style={S.label}>Username</label>
            <input style={S.input} {...field('username')} disabled={!isNew} />
            <label style={S.label}>Email</label>
            <input style={S.input} type="email" {...field('email')} />
            <label style={S.label}>Ruolo</label>
            <select style={{...S.input, cursor: 'pointer'}} {...field('role')}>
                <option value="user">user</option>
                <option value="admin">admin</option>
            </select>
            <label style={S.label}>{isNew ? 'Password' : 'Nuova password (lascia vuoto per non cambiare)'}</label>
            <input style={S.input} type="password" {...field('password')} />
            {err && <div style={S.error}>{err}</div>}
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                <Btn style={S.btnSecondary} onClick={onClose}>Annulla</Btn>
                <Btn style={S.btnPrimary}   onClick={handleSave} disabled={busy}>
                    {busy ? 'Salvataggio…' : 'Salva'}
                </Btn>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// AdminUsers – gestione utenti
// ---------------------------------------------------------------------------
function AdminUsers() {
    const [users, setUsers]   = useState([]);
    const [busy, setBusy]     = useState(true);
    const [modal, setModal]   = useState(null);  // null | 'create' | user-object
    const {user: me}          = useAuth();

    async function load() {
        setBusy(true);
        try { setUsers(await apiFetch('/api/admin/users')); }
        catch {}
        finally { setBusy(false); }
    }

    useEffect(() => { load(); }, []);

    async function deleteUser(u) {
        if (!confirm(`Eliminare l'utente "${u.username}"?`)) return;
        try { await apiFetch(`/api/admin/users/${u.id}`, {method: 'DELETE'}); load(); }
        catch (ex) { alert(ex.message); }
    }

    function closeAndReload() { setModal(null); load(); }

    return (
        <div>
            <div style={{padding: '16px 24px 0', display: 'flex', justifyContent: 'flex-end'}}>
                <Btn style={S.btnPrimary} onClick={() => setModal('create')}>+ Nuovo utente</Btn>
            </div>
            <div style={S.tableWrap}>
                <table style={S.table}>
                    <thead>
                        <tr>
                            {['Username','Email','Ruolo','Attivo','Creato','Azioni'].map(h =>
                                <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {busy && (
                            <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                Caricamento…
                            </td></tr>
                        )}
                        {!busy && users.map(u => (
                            <tr key={u.id}>
                                <td style={S.td}><strong>{u.username}</strong></td>
                                <td style={S.td}>{u.email || '—'}</td>
                                <td style={S.td}>
                                    <span style={{...S.badge, background: u.role==='admin'?'#3b2e6e':'#1e3a5f',
                                                  color: u.role==='admin'?'#a78bfa':'#7cb9e8'}}>
                                        {u.role}
                                    </span>
                                </td>
                                <td style={S.td}>{u.is_active ? '✅' : '❌'}</td>
                                <td style={S.td}>{u.created_at ? u.created_at.slice(0,10) : '—'}</td>
                                <td style={S.td}>
                                    <Btn style={{...S.btnSecondary, ...S.btnSmall, marginRight:6}}
                                         onClick={() => setModal(u)}>Modifica</Btn>
                                    <Btn style={{...S.btnDanger, ...S.btnSmall}}
                                         onClick={() => deleteUser(u)}
                                         disabled={u.id === me?.id}>Elimina</Btn>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {modal === 'create' && <UserModal onSave={closeAndReload} onClose={() => setModal(null)} />}
            {modal && modal !== 'create' && (
                <UserModal user={modal} onSave={closeAndReload} onClose={() => setModal(null)} />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// AdminProjects – elenco globale progetti (admin)
// ---------------------------------------------------------------------------
function AdminProjects() {
    const [projects, setProjects] = useState([]);
    const [busy, setBusy]         = useState(true);

    async function load() {
        setBusy(true);
        try { setProjects(await apiFetch('/api/admin/projects')); }
        catch {}
        finally { setBusy(false); }
    }

    useEffect(() => { load(); }, []);

    async function deleteProject(name) {
        if (!confirm(`Eliminare il progetto "${name}"?`)) return;
        try { await apiFetch(`/api/admin/projects/${encodeURIComponent(name)}`, {method: 'DELETE'}); load(); }
        catch (ex) { alert(ex.message); }
    }

    return (
        <div style={S.tableWrap}>
            <table style={S.table}>
                <thead>
                    <tr>
                        {['Nome','Titolo','CRS','Dimensione','Aggiornato','Azioni'].map(h =>
                            <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {busy && (
                        <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                            Caricamento…
                        </td></tr>
                    )}
                    {!busy && projects.map(p => (
                        <tr key={p.name}>
                            <td style={S.td}><code style={{color:'#7cb9e8'}}>{p.name}</code></td>
                            <td style={S.td}>{p.title || '—'}</td>
                            <td style={S.td}>{p.crs  || '—'}</td>
                            <td style={S.td}>{p.file_size ? `${Math.round(p.file_size/1024)} KB` : '—'}</td>
                            <td style={S.td}>{p.updated_at ? p.updated_at.slice(0,10) : '—'}</td>
                            <td style={S.td}>
                                <Btn style={{...S.btnDanger, ...S.btnSmall}}
                                     onClick={() => deleteProject(p.name)}>Elimina</Btn>
                            </td>
                        </tr>
                    ))}
                    {!busy && projects.length === 0 && (
                        <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                            Nessun progetto.
                        </td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ---------------------------------------------------------------------------
// AdminDashboard
// ---------------------------------------------------------------------------
function AdminDashboard() {
    const [tab, setTab] = useState('users');

    return (
        <div style={{flex: 1}}>
            <div style={S.tabs}>
                {[['users','👥 Utenti'],['projects','🗺 Progetti']].map(([key, label]) => (
                    <div key={key} style={{...S.tab, ...(tab===key ? S.tabActive : {})}}
                         onClick={() => setTab(key)}>{label}</div>
                ))}
            </div>
            {tab === 'users'    && <AdminUsers    />}
            {tab === 'projects' && <AdminProjects />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// HealthBadge
// ---------------------------------------------------------------------------
function HealthBadge({health}) {
    if (!health) return <span style={{color:'#9ba3af',fontSize:12}}>—</span>;
    return (
        <div>
            <span style={S.pill(health.status)}>{health.status}</span>
            <ul style={{margin:'4px 0 0', padding:'0 0 0 14px', fontSize:11, color:'#9ba3af'}}>
                {Object.entries(health.checks).map(([k,v]) => (
                    <li key={k}><strong>{k}:</strong> {v}</li>
                ))}
            </ul>
        </div>
    );
}

// ---------------------------------------------------------------------------
// UserProjects – dashboard dell'utente
// ---------------------------------------------------------------------------
function UserProjects() {
    const [projects, setProjects] = useState([]);
    const [busy, setBusy]         = useState(true);
    const [healthMap, setHealthMap] = useState({});  // name → health object | 'loading'

    useEffect(() => {
        apiFetch('/api/user/projects')
            .then(ps => setProjects(ps))
            .catch(() => {})
            .finally(() => setBusy(false));
    }, []);

    async function checkHealth(name) {
        setHealthMap(m => ({...m, [name]: 'loading'}));
        try {
            const h = await apiFetch(`/api/user/projects/${encodeURIComponent(name)}/health`);
            setHealthMap(m => ({...m, [name]: h}));
        } catch (ex) {
            setHealthMap(m => ({...m, [name]: {status: 'error', checks: {error: ex.message}}}));
        }
    }

    return (
        <div>
            <div style={{padding:'16px 24px 0', color:'#9ba3af', fontSize:13}}>
                I progetti caricati nel tuo account.
            </div>
            <div style={S.tableWrap}>
                <table style={S.table}>
                    <thead>
                        <tr>
                            {['Nome','Titolo','CRS','Dimensione','Aggiornato','Health'].map(h =>
                                <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {busy && (
                            <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                Caricamento…
                            </td></tr>
                        )}
                        {!busy && projects.map(p => {
                            const h = healthMap[p.name];
                            return (
                                <tr key={p.name}>
                                    <td style={S.td}>
                                        <a href={`/?t=${encodeURIComponent(p.name)}`}
                                           style={{color:'#7cb9e8', textDecoration:'none'}}>
                                            {p.name}
                                        </a>
                                    </td>
                                    <td style={S.td}>{p.title || '—'}</td>
                                    <td style={S.td}>{p.crs   || '—'}</td>
                                    <td style={S.td}>{p.file_size ? `${Math.round(p.file_size/1024)} KB` : '—'}</td>
                                    <td style={S.td}>{p.updated_at ? p.updated_at.slice(0,10) : '—'}</td>
                                    <td style={S.td}>
                                        {!h && (
                                            <Btn style={{...S.btnSecondary,...S.btnSmall}}
                                                 onClick={() => checkHealth(p.name)}>
                                                🔍 Verifica
                                            </Btn>
                                        )}
                                        {h === 'loading' && <span style={{fontSize:12,color:'#9ba3af'}}>…</span>}
                                        {h && h !== 'loading' && <HealthBadge health={h} />}
                                    </td>
                                </tr>
                            );
                        })}
                        {!busy && projects.length === 0 && (
                            <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                Nessun progetto. <a href="/" style={{color:'#7cb9e8'}}>Carica un progetto</a> dalla mappa.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// UserDashboard
// ---------------------------------------------------------------------------
function UserDashboard() {
    return (
        <div style={{flex: 1}}>
            <div style={S.tabs}>
                <div style={{...S.tab, ...S.tabActive}}>🗺 I miei progetti</div>
            </div>
            <UserProjects />
        </div>
    );
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------
function AppShell() {
    const {user, loading, logout} = useAuth();
    // 'login' | 'forgot' | null (when authenticated)
    const [view, setView] = useState('login');

    // Controlla se c'è un token di reset nell'URL (?reset_token=...)
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');

    if (loading) {
        return (
            <div style={{...S.loginWrap, flex: 1, color:'#9ba3af', fontSize:14}}>
                Caricamento…
            </div>
        );
    }

    // Se c'è un reset_token nell'URL → mostra il form di reset password
    if (resetToken) {
        return (
            <ResetPasswordForm
                token={resetToken}
                onDone={() => {
                    window.history.replaceState({}, '', '/admin');
                    setView('login');
                    window.location.reload();
                }}
            />
        );
    }

    if (!user) {
        if (view === 'forgot') {
            return <ForgotPasswordForm onBack={() => setView('login')} />;
        }
        return <LoginForm onForgot={() => setView('forgot')} />;
    }

    return (
        <>
            <div style={S.header}>
                <span style={S.logo}>🗺 Dufour.app</span>
                <span style={{color:'#9ba3af', fontSize:13}}>Pannello di gestione</span>
                <div style={S.user}>
                    <span>{user.username}</span>
                    <span style={S.badge}>{user.role}</span>
                    <Btn style={S.btnSecondary} onClick={logout}>Esci</Btn>
                    <Btn style={S.btnSecondary} onClick={() => window.location.href='/'}>
                        ← Mappa
                    </Btn>
                </div>
            </div>
            {user.role === 'admin' ? <AdminDashboard /> : <UserDashboard />}
        </>
    );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function AdminApp() {
    return (
        <AuthProvider>
            <div style={S.page}>
                <AppShell />
            </div>
        </AuthProvider>
    );
}

const root = createRoot(document.getElementById('admin-root'));
root.render(<AdminApp />);
