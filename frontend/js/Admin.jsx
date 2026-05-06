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
import {I18nProvider, useI18n} from './adminI18n';

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

// Upload progetto QGIS (multipart/form-data — NO Content-Type header)
async function apiUploadProject(formData) {
    const token = getToken();
    const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: token ? {Authorization: `Bearer ${token}`} : {},
        body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
}

// Elimina progetto (usa endpoint admin o generico)
async function apiDeleteProject(name, isAdmin) {
    const path = isAdmin
        ? `/api/admin/projects/${encodeURIComponent(name)}`
        : `/api/projects/${encodeURIComponent(name)}`;
    return apiFetch(path, {method: 'DELETE'});
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
// Hook: public API base URL (per link WMS esterni)
// ---------------------------------------------------------------------------
let _apiBaseUrlCache = null;

function useApiBaseUrl() {
    const [base, setBase] = useState(_apiBaseUrlCache || '');
    useEffect(() => {
        if (_apiBaseUrlCache) return;
        fetch(`${API}/api/info`)
            .then(r => r.ok ? r.json() : {})
            .then(d => {
                const url = (d.api_base_url || window.location.origin).replace(/\/+$/, '');
                _apiBaseUrlCache = url;
                setBase(url);
            })
            .catch(() => {
                _apiBaseUrlCache = window.location.origin;
                setBase(window.location.origin);
            });
    }, []);
    return base;
}

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
    const {t, lang, setLang, LANGS} = useI18n();
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
                <h2 style={S.h2}>{t('login.title')}</h2>
                <form onSubmit={handleSubmit}>
                    <label style={S.label}>{t('login.username')}</label>
                    <input style={S.input} value={username}
                           onChange={e => setUsername(e.target.value)} autoFocus required />
                    <label style={S.label}>{t('login.password')}</label>
                    <input style={S.input} type="password" value={password}
                           onChange={e => setPassword(e.target.value)} required />
                    {err && <div style={S.error}>{err}</div>}
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px'}}
                         type="submit" disabled={busy}>
                        {busy ? t('login.submitting') : t('login.submit')}
                    </Btn>
                </form>
                <div style={{textAlign: 'center', marginTop: 16}}>
                    <span style={{fontSize: 13, color: '#7cb9e8', cursor: 'pointer',
                                  textDecoration: 'underline'}}
                          onClick={onForgot}>
                        {t('login.forgot')}
                    </span>
                </div>
                <div style={{display:'flex', justifyContent:'center', gap:4, marginTop:16}}>
                    {LANGS.map(l => (
                        <button key={l.code}
                                onClick={() => setLang(l.code)}
                                title={l.label}
                                style={{
                                    background: lang === l.code ? '#354a6a' : 'transparent',
                                    border: lang === l.code ? '1px solid #7cb9e8' : '1px solid transparent',
                                    borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                                    fontSize: 16, lineHeight: 1,
                                }}>
                            {l.flag}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ForgotPasswordForm – richiesta email per reset
// ---------------------------------------------------------------------------
function ForgotPasswordForm({onBack}) {
    const {t} = useI18n();
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
                    <h2 style={S.h2}>{t('forgot.sent.title')}</h2>
                    <p style={{color: '#9ba3af', fontSize: 14, lineHeight: 1.6}}
                       dangerouslySetInnerHTML={{__html: t('forgot.sent.desc', {email})}} />
                    <p style={{color: '#9ba3af', fontSize: 13, marginTop: 12}}>
                        {t('forgot.sent.hint')}
                    </p>
                    <Btn style={{...S.btnSecondary, width: '100%', padding: '9px', marginTop: 20}}
                         onClick={onBack}>
                        {t('forgot.back')}
                    </Btn>
                </div>
            </div>
        );
    }

    return (
        <div style={S.loginWrap}>
            <div style={S.card}>
                <h2 style={S.h2}>{t('forgot.title')}</h2>
                <p style={{color: '#9ba3af', fontSize: 13, marginBottom: 20}}>
                    {t('forgot.desc')}
                </p>
                <form onSubmit={handleSubmit}>
                    <label style={S.label}>{t('forgot.email')}</label>
                    <input style={S.input} type="email" value={email}
                           onChange={e => setEmail(e.target.value)} autoFocus required
                           placeholder={t('forgot.placeholder')} />
                    {err && <div style={S.error}>{err}</div>}
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px'}}
                         type="submit" disabled={busy}>
                        {busy ? t('forgot.submitting') : t('forgot.submit')}
                    </Btn>
                </form>
                <div style={{textAlign: 'center', marginTop: 16}}>
                    <span style={{fontSize: 13, color: '#7cb9e8', cursor: 'pointer',
                                  textDecoration: 'underline'}}
                          onClick={onBack}>
                        {t('forgot.back')}
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
    const {t} = useI18n();
    const [password, setPassword]   = useState('');
    const [confirm, setConfirm]     = useState('');
    const [err, setErr]             = useState('');
    const [success, setSuccess]     = useState(false);
    const [busy, setBusy]           = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        if (password !== confirm) { setErr(t('reset.err.mismatch')); return; }
        if (password.length < 6) { setErr(t('reset.err.short')); return; }
        setBusy(true); setErr('');
        try {
            await apiResetPassword(token, password);
            setSuccess(true);
            window.history.replaceState({}, '', '/admin');
        } catch (ex) { setErr(ex.message); }
        finally { setBusy(false); }
    }

    if (success) {
        return (
            <div style={S.loginWrap}>
                <div style={S.card}>
                    <h2 style={S.h2}>{t('reset.success.title')}</h2>
                    <p style={{color: '#9ba3af', fontSize: 14, lineHeight: 1.6}}>
                        {t('reset.success.desc')}
                    </p>
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px', marginTop: 20}}
                         onClick={onDone}>
                        {t('reset.success.action')}
                    </Btn>
                </div>
            </div>
        );
    }

    return (
        <div style={S.loginWrap}>
            <div style={S.card}>
                <h2 style={S.h2}>{t('reset.title')}</h2>
                <p style={{color: '#9ba3af', fontSize: 13, marginBottom: 20}}>
                    {t('reset.desc')}
                </p>
                <form onSubmit={handleSubmit}>
                    <label style={S.label}>{t('reset.password')}</label>
                    <input style={S.input} type="password" value={password}
                           onChange={e => setPassword(e.target.value)} autoFocus required
                           minLength={6} placeholder={t('reset.placeholder')} />
                    <label style={S.label}>{t('reset.confirm')}</label>
                    <input style={S.input} type="password" value={confirm}
                           onChange={e => setConfirm(e.target.value)} required
                           minLength={6} placeholder={t('reset.placeholder_confirm')} />
                    {err && <div style={S.error}>{err}</div>}
                    <Btn style={{...S.btnPrimary, width: '100%', padding: '9px'}}
                         type="submit" disabled={busy}>
                        {busy ? t('reset.submitting') : t('reset.submit')}
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
    const {t} = useI18n();
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
        <Modal title={isNew ? t('usermodal.new') : t('usermodal.edit', {name: initial.username})} onClose={onClose}>
            <label style={S.label}>{t('usermodal.username')}</label>
            <input style={S.input} {...field('username')} disabled={!isNew} />
            <label style={S.label}>{t('usermodal.email')}</label>
            <input style={S.input} type="email" {...field('email')} />
            <label style={S.label}>{t('usermodal.role')}</label>
            <select style={{...S.input, cursor: 'pointer'}} {...field('role')}>
                <option value="user">user</option>
                <option value="admin">admin</option>
            </select>
            <label style={S.label}>{isNew ? t('usermodal.password_new') : t('usermodal.password_edit')}</label>
            <input style={S.input} type="password" {...field('password')} />
            {err && <div style={S.error}>{err}</div>}
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                <Btn style={S.btnSecondary} onClick={onClose}>{t('usermodal.cancel')}</Btn>
                <Btn style={S.btnPrimary}   onClick={handleSave} disabled={busy}>
                    {busy ? t('usermodal.saving') : t('usermodal.save')}
                </Btn>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// UploadProjectModal – caricamento progetto .qgz + companion files
// ---------------------------------------------------------------------------
function UploadProjectModal({onSave, onClose}) {
    const {t} = useI18n();
    const [form, setForm] = useState({name: '', title: '', description: '', is_public: false, import_geoservice_layers: false});
    const [qgzFile, setQgzFile]       = useState(null);
    const [dataFiles, setDataFiles]   = useState([]);  // FileList → array
    const [err, setErr]               = useState('');
    const [busy, setBusy]             = useState(false);
    const [progress, setProgress]     = useState('');

    function field(name) {
        return {
            value: form[name],
            onChange: e => setForm(f => ({...f, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value})),
        };
    }

    async function handleUpload() {
        if (!form.name.trim()) { setErr(t('upload.err.name')); return; }
        if (!qgzFile) { setErr(t('upload.err.file')); return; }
        setBusy(true); setErr(''); setProgress(t('upload.progress'));
        try {
            const fd = new FormData();
            fd.append('name', form.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
            if (form.title)       fd.append('title', form.title);
            if (form.description) fd.append('description', form.description);
            fd.append('is_public', form.is_public ? 'true' : 'false');
            fd.append('import_geoservice_layers', form.import_geoservice_layers ? 'true' : 'false');
            fd.append('file', qgzFile);
            for (const f of dataFiles) {
                fd.append('data_files', f);
            }
            setProgress(t('upload.progress2'));
            const result = await apiUploadProject(fd);
            setProgress('');
            onSave(result);
        } catch (ex) {
            setErr(ex.message);
            setProgress('');
        } finally { setBusy(false); }
    }

    return (
        <Modal title={t('upload.title')} onClose={onClose}>
            <label style={S.label}>{t('upload.name')}</label>
            <input style={S.input} {...field('name')}
                   placeholder={t('upload.name_ph')} autoFocus />

            <label style={S.label}>{t('upload.project_title')}</label>
            <input style={S.input} {...field('title')} placeholder={t('upload.title_ph')} />

            <label style={S.label}>{t('upload.desc')}</label>
            <input style={S.input} {...field('description')} placeholder={t('upload.desc_ph')} />

            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16}}>
                <input type="checkbox" id="pub" checked={form.is_public}
                       onChange={e => setForm(f => ({...f, is_public: e.target.checked}))} />
                <label htmlFor="pub" style={{...S.label, marginBottom: 0, cursor: 'pointer'}}>
                    {t('upload.public')}
                </label>
            </div>

            <div style={{display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16,
                         padding: '10px 12px', background: '#1e2736', borderRadius: 6,
                         border: '1px solid #374151'}}>
                <input type="checkbox" id="geoservice" style={{marginTop: 2}}
                       checked={form.import_geoservice_layers}
                       onChange={e => setForm(f => ({...f, import_geoservice_layers: e.target.checked}))} />
                <div>
                    <label htmlFor="geoservice" style={{...S.label, marginBottom: 2, cursor: 'pointer'}}>
                        {t('upload.geoservice')}
                    </label>
                    <div style={{fontSize: 11, color: '#6b7280'}}>
                        {t('upload.geoservice_hint')}
                    </div>
                </div>
            </div>

            <label style={S.label}>{t('upload.qgz')}</label>
            <input type="file" accept=".qgz,.qgs" style={{...S.input, padding: '6px 10px'}}
                   onChange={e => setQgzFile(e.target.files[0] || null)} />

            <label style={S.label}>{t('upload.data')}</label>
            <input type="file" multiple style={{...S.input, padding: '6px 10px'}}
                   accept=".gpkg,.geojson,.json,.shp,.shx,.dbf,.prj,.cpg,.csv,.tif,.tiff"
                   onChange={e => setDataFiles(Array.from(e.target.files))} />
            {dataFiles.length > 0 && (
                <div style={{fontSize: 11, color: '#9ba3af', marginBottom: 12}}>
                    {dataFiles.map(f => f.name).join(', ')}
                </div>
            )}

            {err && <div style={S.error}>{err}</div>}
            {progress && (
                <div style={{fontSize: 12, color: '#7cb9e8', marginBottom: 12, display: 'flex',
                             alignItems: 'center', gap: 8}}>
                    <span style={{display: 'inline-block', width: 14, height: 14,
                                  border: '2px solid #7cb9e8', borderTopColor: 'transparent',
                                  borderRadius: '50%', animation: 'spin 1s linear infinite'}} />
                    {progress}
                </div>
            )}

            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                <Btn style={S.btnSecondary} onClick={onClose} disabled={busy}>{t('upload.cancel')}</Btn>
                <Btn style={S.btnPrimary} onClick={handleUpload} disabled={busy}>
                    {busy ? t('upload.submitting') : t('upload.submit')}
                </Btn>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// ConfirmDeleteModal – conferma sicura prima di eliminare un progetto
// L'utente deve digitare il nome del progetto per abilitare il bottone.
// ---------------------------------------------------------------------------
function ConfirmDeleteModal({projectName, onConfirm, onClose}) {
    const {t} = useI18n();
    const [typed, setTyped] = useState('');
    const match = typed === projectName;

    return (
        <Modal title={t('delete.title')} onClose={onClose}>
            <p style={{color:'#f87171', margin:'0 0 12px', fontSize:14, lineHeight:1.5}}
               dangerouslySetInnerHTML={{__html:
                   t('delete.desc', {name: projectName}) + '<br/>' + t('delete.irreversible')
               }} />
            <label style={S.label}>
                {t('delete.prompt')}
                <span style={{fontFamily:'monospace', color:'#fbbf24', marginLeft:4}}>{projectName}</span>
            </label>
            <input
                style={{...S.input, borderColor: match ? '#4ade80' : undefined}}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder={projectName}
                autoFocus
            />
            <div style={{display:'flex', gap:8, marginTop:16, justifyContent:'flex-end'}}>
                <Btn style={S.btnSecondary} onClick={onClose}>{t('delete.cancel')}</Btn>
                <Btn
                    style={{...S.btnDanger, opacity: match ? 1 : 0.4, cursor: match ? 'pointer' : 'not-allowed'}}
                    disabled={!match}
                    onClick={() => { if (match) onConfirm(); }}
                >
                    {t('delete.confirm')}
                </Btn>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// AdminUsers – gestione utenti
// ---------------------------------------------------------------------------
function AdminUsers() {
    const {t} = useI18n();
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
        if (!confirm(t('users.confirm_delete', {name: u.username}))) return;
        try { await apiFetch(`/api/admin/users/${u.id}`, {method: 'DELETE'}); load(); }
        catch (ex) { alert(ex.message); }
    }

    function closeAndReload() { setModal(null); load(); }

    return (
        <div>
            <div style={{padding: '16px 24px 0', display: 'flex', justifyContent: 'flex-end'}}>
                <Btn style={S.btnPrimary} onClick={() => setModal('create')}>{t('users.new')}</Btn>
            </div>
            <div style={S.tableWrap}>
                <table style={S.table}>
                    <thead>
                        <tr>
                            {[t('users.col.username'),t('users.col.email'),t('users.col.role'),t('users.col.active'),t('users.col.created'),t('users.col.actions')].map(h =>
                                <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {busy && (
                            <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                {t('loading')}
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
                                         onClick={() => setModal(u)}>{t('users.edit')}</Btn>
                                    <Btn style={{...S.btnDanger, ...S.btnSmall}}
                                         onClick={() => deleteUser(u)}
                                         disabled={u.id === me?.id}>{t('users.delete')}</Btn>
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
    const {t} = useI18n();
    const [projects, setProjects] = useState([]);
    const [busy, setBusy]         = useState(true);
    const [showUpload, setShowUpload] = useState(false);
    const [healthMap, setHealthMap] = useState({});
    const [confirmDelete, setConfirmDelete] = useState(null);   // project name or null
    const apiBase = useApiBaseUrl();

    async function load() {
        setBusy(true);
        try { setProjects(await apiFetch('/api/admin/projects')); }
        catch {}
        finally { setBusy(false); }
    }

    useEffect(() => { load(); }, []);

    async function doDelete(name) {
        try { await apiDeleteProject(name, true); setConfirmDelete(null); load(); }
        catch (ex) { alert(ex.message); }
    }

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
            <div style={{padding: '16px 24px 0', display: 'flex', justifyContent: 'flex-end'}}>
                <Btn style={S.btnPrimary} onClick={() => setShowUpload(true)}>{t('projects.upload')}</Btn>
            </div>
            <div style={S.tableWrap}>
                <table style={S.table}>
                    <thead>
                        <tr>
                            {[t('projects.col.name'),t('projects.col.title'),t('projects.col.owner'),t('projects.col.crs'),t('projects.col.size'),t('projects.col.updated'),t('projects.col.actions')].map(h =>
                                <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {busy && (
                            <tr><td colSpan={7} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                {t('loading')}
                            </td></tr>
                        )}
                        {!busy && projects.map(p => {
                            const h = healthMap[p.name];
                            return (
                                <tr key={p.name}>
                                    <td style={S.td}>
                                        <a href={`/?t=${encodeURIComponent(p.name)}`}
                                           style={{color:'#7cb9e8', textDecoration:'none', fontWeight:600}}>
                                            {p.name}
                                        </a>
                                    </td>
                                    <td style={S.td}>{p.title || '—'}</td>
                                    <td style={S.td}>{p.owner || <span style={{color:'#9ba3af', fontStyle:'italic'}}>—</span>}</td>
                                    <td style={S.td}>{p.crs  || '—'}</td>
                                    <td style={S.td}>{p.file_size ? `${Math.round(p.file_size/1024)} KB` : '—'}</td>
                                    <td style={S.td}>{p.updated_at ? String(p.updated_at).slice(0,10) : '—'}</td>
                                    <td style={{...S.td, whiteSpace:'nowrap'}}>
                                        <div style={{display:'flex', gap:4, flexWrap:'wrap', alignItems:'center'}}>
                                            <Btn style={{...S.btnSecondary, ...S.btnSmall}}
                                                 onClick={() => window.open(`${apiBase}/api/projects/${encodeURIComponent(p.name)}/wms?SERVICE=WMS&REQUEST=GetCapabilities`, '_blank')}
                                                 title="WMS GetCapabilities">🌐 WMS</Btn>
                                            <Btn style={{...S.btnDanger, ...S.btnSmall}}
                                                 onClick={() => setConfirmDelete(p.name)}>{t('projects.delete')}</Btn>
                                            {!h && (
                                                <Btn style={{...S.btnSecondary, ...S.btnSmall}}
                                                     onClick={() => checkHealth(p.name)}
                                                     title="Health check">🔍</Btn>
                                            )}
                                            {h === 'loading' && <span style={{fontSize:12,color:'#9ba3af'}}>…</span>}
                                            {h && h !== 'loading' && <HealthBadge health={h} />}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {!busy && projects.length === 0 && (
                            <tr><td colSpan={7} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                {t('projects.empty')}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {showUpload && (
                <UploadProjectModal
                    onSave={() => { setShowUpload(false); load(); }}
                    onClose={() => setShowUpload(false)}
                />
            )}
            {confirmDelete && (
                <ConfirmDeleteModal
                    projectName={confirmDelete}
                    onConfirm={() => doDelete(confirmDelete)}
                    onClose={() => setConfirmDelete(null)}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// AdminFleet – gestione fleet Traccar embeddednel pannello admin
// Sub-tab: Dispositivi | Flotte | Assegnazione Progetti
// ---------------------------------------------------------------------------

const DEVICE_CATEGORIES = [
    'default','car','truck','van','bus','motorcycle','bicycle',
    'pedestrian','animal','helicopter','ship','train','tractor','arrow',
];

function DeviceModal({device, groups, onSave, onClose}) {
    const {t} = useI18n();
    const editing = Boolean(device && device.id);
    const [form, setForm] = useState({
        name: device?.name || '',
        uniqueId: device?.uniqueId || '',
        groupId: device?.groupId || '',
        category: device?.category || 'default',
        phone: device?.phone || '',
        model: device?.model || '',
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    async function handleSave() {
        if (!form.name.trim() || !form.uniqueId.trim()) {
            setErr('Name and identifier are required'); return;
        }
        setBusy(true); setErr('');
        const payload = {...form, groupId: form.groupId ? Number(form.groupId) : null};
        try {
            if (editing) {
                await apiFetch(`/api/tracking/devices/${device.id}`, {
                    method: 'PUT', body: JSON.stringify(payload),
                });
            } else {
                await apiFetch('/api/tracking/devices', {
                    method: 'POST', body: JSON.stringify(payload),
                });
            }
            onSave();
        } catch (ex) { setErr(ex.message); }
        finally { setBusy(false); }
    }

    const inp = (key, label, ph) => (
        <div key={key}>
            <label style={S.label}>{label}</label>
            <input style={S.input} value={form[key]} placeholder={ph || ''}
                   onChange={e => setForm(f => ({...f, [key]: e.target.value}))} />
        </div>
    );

    return (
        <Modal title={editing ? t('fleet.modal.device.edit') : t('fleet.modal.device.new')} onClose={onClose}>
            {inp('name', t('fleet.modal.device.name'), 'es. Veicolo Alpha')}
            {inp('uniqueId', t('fleet.modal.device.id'), 'IMEI / Device ID OsmAnd')}
            <label style={S.label}>{t('fleet.modal.device.group')}</label>
            <select style={S.input} value={form.groupId || ''}
                    onChange={e => setForm(f => ({...f, groupId: e.target.value}))}>
                <option value="">—</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <label style={S.label}>{t('fleet.modal.device.cat')}</label>
            <select style={S.input} value={form.category}
                    onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                {DEVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {inp('phone', t('fleet.modal.device.phone'))}
            {inp('model', t('fleet.modal.device.model'))}
            {err && <div style={S.error}>{err}</div>}
            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
                <Btn style={S.btnSecondary} onClick={onClose} disabled={busy}>{t('fleet.modal.cancel')}</Btn>
                <Btn style={S.btnPrimary} onClick={handleSave} disabled={busy}>
                    {busy ? t('fleet.modal.saving') : t('fleet.modal.save')}
                </Btn>
            </div>
        </Modal>
    );
}

function GroupModal({group, onSave, onClose}) {
    const {t} = useI18n();
    const editing = Boolean(group && group.id);
    const [name, setName] = useState(group?.name || '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    async function handleSave() {
        if (!name.trim()) { setErr('Name required'); return; }
        setBusy(true); setErr('');
        try {
            if (editing) {
                await apiFetch(`/api/tracking/groups/${group.id}`, {
                    method: 'PUT', body: JSON.stringify({name}),
                });
            } else {
                await apiFetch('/api/tracking/groups', {
                    method: 'POST', body: JSON.stringify({name}),
                });
            }
            onSave();
        } catch (ex) { setErr(ex.message); }
        finally { setBusy(false); }
    }

    return (
        <Modal title={editing ? t('fleet.modal.group.edit') : t('fleet.modal.group.new')} onClose={onClose}>
            <label style={S.label}>{t('fleet.modal.group.name')}</label>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)} autoFocus />
            {err && <div style={S.error}>{err}</div>}
            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
                <Btn style={S.btnSecondary} onClick={onClose} disabled={busy}>{t('fleet.modal.cancel')}</Btn>
                <Btn style={S.btnPrimary} onClick={handleSave} disabled={busy}>
                    {busy ? t('fleet.modal.saving') : t('fleet.modal.save')}
                </Btn>
            </div>
        </Modal>
    );
}

function StatusDot({status}) {
    const color = status === 'online' ? '#4ade80' : status === 'offline' ? '#f87171' : '#9ba3af';
    return (
        <span style={{
            display:'inline-block', width:8, height:8, borderRadius:'50%',
            background: color, marginRight:6, verticalAlign:'middle',
        }} />
    );
}

function FleetDevices({groups}) {
    const {t} = useI18n();
    const [devices, setDevices] = useState([]);
    const [busy, setBusy]         = useState(true);
    const [modal, setModal]       = useState(null);   // null | 'create' | device

    const groupsById = Object.fromEntries(groups.map(g => [g.id, g]));

    async function load() {
        setBusy(true);
        try { setDevices(await apiFetch('/api/tracking/devices')); }
        catch {}
        finally { setBusy(false); }
    }

    useEffect(() => { load(); }, []);

    async function deleteDevice(d) {
        if (!confirm(t('fleet.devices.confirm', {name: d.name}))) return;
        try {
            await apiFetch(`/api/tracking/devices/${d.id}`, {method: 'DELETE'});
            load();
        } catch (ex) { alert(ex.message); }
    }

    function closeAndReload() { setModal(null); load(); }

    const cols = [
        t('fleet.devices.col.name'), t('fleet.devices.col.id'), t('fleet.devices.col.group'),
        t('fleet.devices.col.status'), t('fleet.devices.col.last'), t('fleet.devices.col.actions'),
    ];

    return (
        <div>
            <div style={{padding:'16px 24px 0', display:'flex', justifyContent:'flex-end'}}>
                <Btn style={S.btnPrimary} onClick={() => setModal('create')}>{t('fleet.devices.new')}</Btn>
            </div>
            <div style={S.tableWrap}>
                <table style={S.table}>
                    <thead>
                        <tr>{cols.map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {busy && <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>{t('loading')}</td></tr>}
                        {!busy && devices.map(d => (
                            <tr key={d.id}>
                                <td style={S.td}><strong>{d.name}</strong></td>
                                <td style={{...S.td, fontFamily:'monospace', fontSize:12}}>{d.uniqueId}</td>
                                <td style={S.td}>{d.groupId ? (groupsById[d.groupId]?.name || d.groupId) : '—'}</td>
                                <td style={S.td}>
                                    <StatusDot status={d.status} />
                                    {d.status === 'online' ? t('fleet.status.online') :
                                     d.status === 'offline' ? t('fleet.status.offline') : t('fleet.status.unknown')}
                                </td>
                                <td style={S.td}>{d.lastUpdate ? new Date(d.lastUpdate).toLocaleString() : '—'}</td>
                                <td style={S.td}>
                                    <Btn style={{...S.btnSecondary, ...S.btnSmall, marginRight:6}}
                                         onClick={() => setModal(d)}>{t('fleet.devices.edit')}</Btn>
                                    <Btn style={{...S.btnDanger, ...S.btnSmall}}
                                         onClick={() => deleteDevice(d)}>{t('fleet.devices.delete')}</Btn>
                                </td>
                            </tr>
                        ))}
                        {!busy && devices.length === 0 && (
                            <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>—</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {modal === 'create' && <DeviceModal groups={groups} onSave={closeAndReload} onClose={() => setModal(null)} />}
            {modal && modal !== 'create' && (
                <DeviceModal device={modal} groups={groups} onSave={closeAndReload} onClose={() => setModal(null)} />
            )}
        </div>
    );
}

function FleetGroups() {
    const {t} = useI18n();
    const [groups, setGroups] = useState([]);
    const [busy, setBusy]       = useState(true);
    const [modal, setModal]     = useState(null);

    async function load() {
        setBusy(true);
        try { setGroups(await apiFetch('/api/tracking/groups')); }
        catch {}
        finally { setBusy(false); }
    }

    useEffect(() => { load(); }, []);

    async function deleteGroup(g) {
        if (!confirm(t('fleet.groups.confirm', {name: g.name}))) return;
        try {
            await apiFetch(`/api/tracking/groups/${g.id}`, {method: 'DELETE'});
            load();
        } catch (ex) { alert(ex.message); }
    }

    return (
        <div>
            <div style={{padding:'16px 24px 0', display:'flex', justifyContent:'flex-end'}}>
                <Btn style={S.btnPrimary} onClick={() => setModal('create')}>{t('fleet.groups.new')}</Btn>
            </div>
            <div style={S.tableWrap}>
                <table style={S.table}>
                    <thead>
                        <tr>
                            {[t('fleet.groups.col.name'), t('fleet.groups.col.actions')].map(h =>
                                <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {busy && <tr><td colSpan={2} style={{...S.td, color:'#9ba3af', textAlign:'center'}}>{t('loading')}</td></tr>}
                        {!busy && groups.map(g => (
                            <tr key={g.id}>
                                <td style={S.td}><strong>{g.name}</strong></td>
                                <td style={S.td}>
                                    <Btn style={{...S.btnSecondary, ...S.btnSmall, marginRight:6}}
                                         onClick={() => setModal(g)}>{t('fleet.groups.edit')}</Btn>
                                    <Btn style={{...S.btnDanger, ...S.btnSmall}}
                                         onClick={() => deleteGroup(g)}>{t('fleet.groups.delete')}</Btn>
                                </td>
                            </tr>
                        ))}
                        {!busy && groups.length === 0 && (
                            <tr><td colSpan={2} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>—</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {modal === 'create' && <GroupModal onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
            {modal && modal !== 'create' && (
                <GroupModal group={modal} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />
            )}
        </div>
    );
}

function FleetProjects() {
    const {t} = useI18n();
    const [projects, setProjects]     = useState([]);
    const [devices, setDevices]       = useState([]);
    const [groups, setGroups]         = useState([]);
    const [selected, setSelected]     = useState('');
    const [associations, setAssoc]    = useState([]);
    const [loadingAssoc, setLoadAssoc]= useState(false);
    const [chooser, setChooser]       = useState(null);   // 'device' | 'group'
    const [chooserVal, setChooserVal] = useState('');

    useEffect(() => {
        Promise.all([
            apiFetch('/api/admin/projects').catch(() => []),
            apiFetch('/api/tracking/devices').catch(() => []),
            apiFetch('/api/tracking/groups').catch(() => []),
        ]).then(([p, d, g]) => { setProjects(p); setDevices(d); setGroups(g); });
    }, []);

    useEffect(() => {
        if (!selected) { setAssoc([]); return; }
        setLoadAssoc(true);
        apiFetch(`/api/tracking/projects/${encodeURIComponent(selected)}/devices`)
            .then(a => setAssoc(a))
            .catch(() => setAssoc([]))
            .finally(() => setLoadAssoc(false));
    }, [selected]);

    async function removeAssoc(entryId) {
        try {
            await apiFetch(
                `/api/tracking/projects/${encodeURIComponent(selected)}/devices/${entryId}`,
                {method: 'DELETE'}
            );
            setAssoc(prev => prev.filter(a => a.id !== entryId));
        } catch (ex) { alert(ex.message); }
    }

    async function addAssoc() {
        if (!chooserVal) return;
        const body = chooser === 'device'
            ? {device_id: Number(chooserVal)}
            : {group_id: Number(chooserVal)};
        try {
            const entry = await apiFetch(
                `/api/tracking/projects/${encodeURIComponent(selected)}/devices`,
                {method: 'POST', body: JSON.stringify(body)}
            );
            // refetch to get enriched names
            const updated = await apiFetch(`/api/tracking/projects/${encodeURIComponent(selected)}/devices`);
            setAssoc(updated);
        } catch (ex) { alert(ex.message); }
        setChooser(null); setChooserVal('');
    }

    const typeLabel = (a) => a.type === 'device' ? t('fleet.projects.type.device') : t('fleet.projects.type.group');

    return (
        <div style={{padding:24}}>
            <p style={{color:'#9ba3af', fontSize:13, marginTop:0}}>{t('fleet.projects.desc')}</p>

            <label style={S.label}>{t('fleet.projects.select')}</label>
            <select style={{...S.input, width:320}}
                    value={selected} onChange={e => setSelected(e.target.value)}>
                <option value="">—</option>
                {projects.map(p => <option key={p.name} value={p.name}>{p.title || p.name}</option>)}
            </select>

            {selected && (
                <div style={{marginTop:20}}>
                    <div style={{display:'flex', gap:8, marginBottom:12}}>
                        <Btn style={S.btnSecondary} onClick={() => { setChooser('device'); setChooserVal(''); }}>
                            {t('fleet.projects.add_device')}
                        </Btn>
                        <Btn style={S.btnSecondary} onClick={() => { setChooser('group'); setChooserVal(''); }}>
                            {t('fleet.projects.add_group')}
                        </Btn>
                    </div>

                    {chooser && (
                        <div style={{display:'flex', gap:8, marginBottom:12, alignItems:'center'}}>
                            <select style={{...S.input, width:260, marginBottom:0}}
                                    value={chooserVal} onChange={e => setChooserVal(e.target.value)}>
                                <option value="">—</option>
                                {chooser === 'device'
                                    ? devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.uniqueId})</option>)
                                    : groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
                                }
                            </select>
                            <Btn style={S.btnPrimary} onClick={addAssoc} disabled={!chooserVal}>
                                {t('fleet.chooser.add')}
                            </Btn>
                            <Btn style={S.btnSecondary} onClick={() => setChooser(null)}>✕</Btn>
                        </div>
                    )}

                    {loadingAssoc && <div style={{color:'#9ba3af', fontSize:13}}>{t('loading')}</div>}
                    {!loadingAssoc && associations.length === 0 && (
                        <div style={{color:'#9ba3af', fontSize:13}}>{t('fleet.projects.empty')}</div>
                    )}
                    {!loadingAssoc && associations.length > 0 && (
                        <div style={S.tableWrap}>
                            <table style={S.table}>
                                <thead>
                                    <tr>
                                        <th style={S.th}>Tipo</th>
                                        <th style={S.th}>Nome</th>
                                        <th style={S.th}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {associations.map(a => (
                                        <tr key={a.id}>
                                            <td style={S.td}>
                                                <span style={{...S.badge,
                                                    background: a.type==='device'?'#1e3a5f':'#2d3b2e',
                                                    color: a.type==='device'?'#7cb9e8':'#4ade80'}}>
                                                    {typeLabel(a)}
                                                </span>
                                            </td>
                                            <td style={S.td}>{a.name}</td>
                                            <td style={S.td}>
                                                <Btn style={{...S.btnDanger, ...S.btnSmall}}
                                                     onClick={() => removeAssoc(a.id)}>
                                                    {t('fleet.projects.remove')}
                                                </Btn>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function AdminFleet() {
    const {t} = useI18n();
    const [sub, setSub] = useState('devices');
    const [groups, setGroups] = useState([]);

    // Load groups once for the devices sub-tab (needs group list for select)
    useEffect(() => {
        apiFetch('/api/tracking/groups').then(setGroups).catch(() => {});
    }, []);

    const subTabs = [
        ['devices',  t('fleet.sub.devices')],
        ['groups',   t('fleet.sub.groups')],
        ['projects', t('fleet.sub.projects')],
    ];

    return (
        <div>
            <div style={{...S.tabs, margin:'0 24px', paddingLeft:0}}>
                {subTabs.map(([key, label]) => (
                    <div key={key}
                         style={{...S.tab, ...(sub===key ? S.tabActive : {}), fontSize:13}}
                         onClick={() => setSub(key)}>
                        {label}
                    </div>
                ))}
            </div>
            {sub === 'devices'  && <FleetDevices groups={groups} />}
            {sub === 'groups'   && <FleetGroups />}
            {sub === 'projects' && <FleetProjects />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// AdminDashboard
// ---------------------------------------------------------------------------
function AdminDashboard() {
    const {t} = useI18n();
    const [tab, setTab] = useState('users');

    return (
        <div style={{flex: 1}}>
            <div style={S.tabs}>
                {[['users', t('tabs.users')],['projects', t('tabs.projects')]].map(([key, label]) => (
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
    const {t} = useI18n();
    const [projects, setProjects] = useState([]);
    const [busy, setBusy]         = useState(true);
    const [healthMap, setHealthMap] = useState({});
    const [showUpload, setShowUpload] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const apiBase = useApiBaseUrl();

    const reload = () => {
        setBusy(true);
        apiFetch('/api/user/projects')
            .then(ps => setProjects(ps))
            .catch(() => {})
            .finally(() => setBusy(false));
    };
    useEffect(reload, []);

    async function checkHealth(name) {
        setHealthMap(m => ({...m, [name]: 'loading'}));
        try {
            const h = await apiFetch(`/api/user/projects/${encodeURIComponent(name)}/health`);
            setHealthMap(m => ({...m, [name]: h}));
        } catch (ex) {
            setHealthMap(m => ({...m, [name]: {status: 'error', checks: {error: ex.message}}}));
        }
    }

    async function doDelete(name) {
        try {
            await apiDeleteProject(name, false);
            setConfirmDelete(null);
            reload();
        } catch (ex) { alert(t('error') + ex.message); }
    }

    return (
        <div>
            <div style={{padding:'16px 24px 0', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{color:'#9ba3af', fontSize:13}}>{t('userprojects.desc')}</span>
                <Btn style={S.btnPrimary} onClick={() => setShowUpload(true)}>{t('projects.upload')}</Btn>
            </div>
            <div style={S.tableWrap}>
                <table style={S.table}>
                    <thead>
                        <tr>
                            {[t('projects.col.name'),t('projects.col.title'),t('projects.col.crs'),t('projects.col.size'),t('projects.col.updated'),t('projects.col.actions')].map(h =>
                                <th key={h} style={S.th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {busy && (
                            <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                {t('loading')}
                            </td></tr>
                        )}
                        {!busy && projects.map(p => {
                            const h = healthMap[p.name];
                            const wmsUrl = `${apiBase}/api/projects/${encodeURIComponent(p.name)}/wms?SERVICE=WMS&REQUEST=GetCapabilities`;
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
                                        <div style={{display:'flex', gap:4, flexWrap:'wrap', alignItems:'center'}}>
                                            <Btn style={{...S.btnSecondary,...S.btnSmall}}
                                                 onClick={() => window.open(wmsUrl, '_blank')}>
                                                🌐 WMS
                                            </Btn>
                                            <Btn style={{...S.btnSecondary,...S.btnSmall}}
                                                 onClick={() => setConfirmDelete(p.name)}>
                                                🗑
                                            </Btn>
                                            {!h && (
                                                <Btn style={{...S.btnSecondary,...S.btnSmall}}
                                                     onClick={() => checkHealth(p.name)}>
                                                    🔍
                                                </Btn>
                                            )}
                                            {h === 'loading' && <span style={{fontSize:12,color:'#9ba3af'}}>…</span>}
                                            {h && h !== 'loading' && <HealthBadge health={h} />}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {!busy && projects.length === 0 && (
                            <tr><td colSpan={6} style={{...S.td, textAlign:'center', color:'#9ba3af'}}>
                                {t('userprojects.empty')}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {showUpload && (
                <UploadProjectModal
                    onClose={() => setShowUpload(false)}
                    onSave={() => { setShowUpload(false); reload(); }}
                />
            )}
            {confirmDelete && (
                <ConfirmDeleteModal
                    projectName={confirmDelete}
                    onConfirm={() => doDelete(confirmDelete)}
                    onClose={() => setConfirmDelete(null)}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// UserDashboard
// ---------------------------------------------------------------------------
function UserDashboard() {
    const {t} = useI18n();
    return (
        <div style={{flex: 1}}>
            <div style={S.tabs}>
                <div style={{...S.tab, ...S.tabActive}}>{t('tabs.myprojects')}</div>
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
    const {t, lang, setLang, LANGS} = useI18n();
    // 'login' | 'forgot' | null (when authenticated)
    const [view, setView] = useState('login');

    // Controlla se c'è un token di reset nell'URL (?reset_token=...)
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');

    if (loading) {
        return (
            <div style={{...S.loginWrap, flex: 1, color:'#9ba3af', fontSize:14}}>
                {t('loading')}
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
                <span style={{color:'#9ba3af', fontSize:13}}>{t('header.subtitle')}</span>
                <div style={S.user}>
                    {[['users', t('tabs.users')],['projects', t('tabs.projects')]].map(([key, label]) => (
                    <div style={{display:'flex', gap:2}}>
                        {LANGS.map(l => (
                            <button key={l.code}
                                    onClick={() => setLang(l.code)}
                                    title={l.label}
                                    style={{
                {tab === 'fleet' && <AdminFleet />}
                                        border: lang === l.code ? '1px solid #7cb9e8' : '1px solid transparent',
                                        borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                                        fontSize: 16, lineHeight: 1,
                                    }}>
                                {l.flag}
                            </button>
                        ))}
                    </div>
                    <span>{user.username}</span>
                    <span style={S.badge}>{user.role}</span>
                    <Btn style={S.btnSecondary} onClick={logout}>{t('header.logout')}</Btn>
                    <Btn style={S.btnSecondary} onClick={() => window.location.href='/'}>
                        {t('header.map')}
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
const spinKeyframes = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;

function AdminApp() {
    return (
        <I18nProvider>
        <AuthProvider>
            <style dangerouslySetInnerHTML={{__html: spinKeyframes}} />
            <div style={S.page}>
                <AppShell />
            </div>
        </AuthProvider>
        </I18nProvider>
    );
}

const root = createRoot(document.getElementById('admin-root'));
root.render(<AdminApp />);
