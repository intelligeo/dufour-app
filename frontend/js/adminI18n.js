/**
 * adminI18n.js – Internazionalizzazione pannello Admin Dufour.app
 *
 * 4 lingue: it, en, fr, de
 * Uso: const {t, lang, setLang, LANGS} = useI18n();
 *      t('login.title')  → "Dufour.app – Gestione" (it) / "Dufour.app – Management" (en) / …
 */
import React, {createContext, useCallback, useContext, useState} from 'react';

// ---------------------------------------------------------------------------
// Dizionari
// ---------------------------------------------------------------------------
const messages = {
    it: {
        // header
        'header.subtitle':          'Pannello di gestione',
        'header.logout':            'Esci',
        'header.map':               '← Mappa',

        // login
        'login.title':              'Dufour.app – Gestione',
        'login.username':           'Username',
        'login.password':           'Password',
        'login.submit':             'Accedi',
        'login.submitting':         'Accesso…',
        'login.forgot':             'Password dimenticata?',

        // forgot password
        'forgot.title':             'Password dimenticata',
        'forgot.desc':              'Inserisci l\'email associata al tuo account. Riceverai un link per reimpostare la password.',
        'forgot.email':             'Email',
        'forgot.placeholder':       'nome@esempio.com',
        'forgot.submit':            'Invia link di reset',
        'forgot.submitting':        'Invio…',
        'forgot.back':              '← Torna al login',
        'forgot.sent.title':        '📧 Controlla la tua email',
        'forgot.sent.desc':         'Se l\'indirizzo <strong>{email}</strong> è associato a un account, riceverai un\'email con un link per reimpostare la password.',
        'forgot.sent.hint':         'Il link è valido per 30 minuti. Controlla anche la cartella spam.',

        // reset password
        'reset.title':              'Nuova password',
        'reset.desc':               'Scegli una nuova password per il tuo account.',
        'reset.password':           'Nuova password',
        'reset.confirm':            'Conferma password',
        'reset.placeholder':        'Almeno 6 caratteri',
        'reset.placeholder_confirm':'Ripeti la password',
        'reset.submit':             'Reimposta password',
        'reset.submitting':         'Salvataggio…',
        'reset.success.title':      '✅ Password reimpostata!',
        'reset.success.desc':       'La tua password è stata cambiata con successo. Ora puoi accedere con la nuova password.',
        'reset.success.action':     'Vai al login',
        'reset.err.mismatch':       'Le password non corrispondono',
        'reset.err.short':          'La password deve essere di almeno 6 caratteri',

        // admin tabs
        'tabs.users':               '👥 Utenti',
        'tabs.projects':            '🗺 Progetti',
        'tabs.myprojects':          '🗺 I miei progetti',

        // users table
        'users.new':                '+ Nuovo utente',
        'users.col.username':       'Username',
        'users.col.email':          'Email',
        'users.col.role':           'Ruolo',
        'users.col.active':         'Attivo',
        'users.col.created':        'Creato',
        'users.col.actions':        'Azioni',
        'users.edit':               'Modifica',
        'users.delete':             'Elimina',
        'users.confirm_delete':     'Eliminare l\'utente "{name}"?',

        // user modal
        'usermodal.new':            'Nuovo utente',
        'usermodal.edit':           'Modifica: {name}',
        'usermodal.username':       'Username',
        'usermodal.email':          'Email',
        'usermodal.role':           'Ruolo',
        'usermodal.password_new':   'Password',
        'usermodal.password_edit':  'Nuova password (lascia vuoto per non cambiare)',
        'usermodal.cancel':         'Annulla',
        'usermodal.save':           'Salva',
        'usermodal.saving':         'Salvataggio…',

        // upload modal
        'upload.title':             '📤 Carica progetto QGIS',
        'upload.name':              'Nome progetto *',
        'upload.name_ph':           'es. my_project (solo a-z, 0-9, _)',
        'upload.project_title':     'Titolo',
        'upload.title_ph':          'es. Carta Topografica 1:25000',
        'upload.desc':              'Descrizione',
        'upload.desc_ph':           'Opzionale',
        'upload.public':            'Pubblico (visibile a tutti)',
        'upload.geoservice':         'Includi layer da geoservizi esterni',
        'upload.geoservice_hint':    'Aggiunge al catalogo i layer WMS/WMTS/XYZ/raster definiti nel progetto QGIS (solo metadati, nessun dato vettoriale estratto)',
        'upload.qgz':              'File QGIS (.qgz) *',
        'upload.data':              'File dati companion (GeoPackage, GeoJSON, Shapefile…)',
        'upload.err.name':          'Nome progetto obbligatorio',
        'upload.err.file':          'Seleziona un file .qgz',
        'upload.progress':          'Caricamento in corso…',
        'upload.progress2':         'Upload e migrazione in corso… (può richiedere 30s)',
        'upload.cancel':            'Annulla',
        'upload.submit':            '📤 Carica',
        'upload.submitting':        'Caricamento…',

        // confirm delete modal
        'delete.title':             '⚠️ Conferma eliminazione',
        'delete.desc':              'Stai per eliminare definitivamente il progetto <strong>{name}</strong> e tutti i suoi dati.',
        'delete.irreversible':      'Questa operazione è <strong>irreversibile</strong>.',
        'delete.prompt':            'Per confermare, digita il nome del progetto:',
        'delete.cancel':            'Annulla',
        'delete.confirm':           '🗑 Elimina definitivamente',

        // projects table (admin)
        'projects.upload':          '📤 Carica progetto',
        'projects.col.name':        'Nome',
        'projects.col.title':       'Titolo',
        'projects.col.owner':       'Proprietario',
        'projects.col.crs':         'CRS',
        'projects.col.size':        'Dimensione',
        'projects.col.updated':     'Aggiornato',
        'projects.col.actions':     'Azioni',
        'projects.empty':           'Nessun progetto. Usa il pulsante "Carica progetto" per iniziare.',
        'projects.delete':          '🗑 Elimina',

        // projects table (user)
        'userprojects.desc':        'I progetti caricati nel tuo account.',
        'userprojects.empty':       'Nessun progetto.',

        // common
        'loading':                  'Caricamento…',
        'error':                    'Errore: ',
    },

    en: {
        'header.subtitle':          'Management panel',
        'header.logout':            'Log out',
        'header.map':               '← Map',

        'login.title':              'Dufour.app – Management',
        'login.username':           'Username',
        'login.password':           'Password',
        'login.submit':             'Log in',
        'login.submitting':         'Logging in…',
        'login.forgot':             'Forgot password?',

        'forgot.title':             'Forgot password',
        'forgot.desc':              'Enter the email associated with your account. You will receive a link to reset your password.',
        'forgot.email':             'Email',
        'forgot.placeholder':       'name@example.com',
        'forgot.submit':            'Send reset link',
        'forgot.submitting':        'Sending…',
        'forgot.back':              '← Back to login',
        'forgot.sent.title':        '📧 Check your email',
        'forgot.sent.desc':         'If the address <strong>{email}</strong> is associated with an account, you will receive an email with a link to reset your password.',
        'forgot.sent.hint':         'The link is valid for 30 minutes. Also check your spam folder.',

        'reset.title':              'New password',
        'reset.desc':               'Choose a new password for your account.',
        'reset.password':           'New password',
        'reset.confirm':            'Confirm password',
        'reset.placeholder':        'At least 6 characters',
        'reset.placeholder_confirm':'Repeat the password',
        'reset.submit':             'Reset password',
        'reset.submitting':         'Saving…',
        'reset.success.title':      '✅ Password reset!',
        'reset.success.desc':       'Your password has been changed successfully. You can now log in with your new password.',
        'reset.success.action':     'Go to login',
        'reset.err.mismatch':       'Passwords do not match',
        'reset.err.short':          'Password must be at least 6 characters',

        'tabs.users':               '👥 Users',
        'tabs.projects':            '🗺 Projects',
        'tabs.myprojects':          '🗺 My projects',

        'users.new':                '+ New user',
        'users.col.username':       'Username',
        'users.col.email':          'Email',
        'users.col.role':           'Role',
        'users.col.active':         'Active',
        'users.col.created':        'Created',
        'users.col.actions':        'Actions',
        'users.edit':               'Edit',
        'users.delete':             'Delete',
        'users.confirm_delete':     'Delete user "{name}"?',

        'usermodal.new':            'New user',
        'usermodal.edit':           'Edit: {name}',
        'usermodal.username':       'Username',
        'usermodal.email':          'Email',
        'usermodal.role':           'Role',
        'usermodal.password_new':   'Password',
        'usermodal.password_edit':  'New password (leave empty to keep current)',
        'usermodal.cancel':         'Cancel',
        'usermodal.save':           'Save',
        'usermodal.saving':         'Saving…',

        'upload.title':             '📤 Upload QGIS project',
        'upload.name':              'Project name *',
        'upload.name_ph':           'e.g. my_project (only a-z, 0-9, _)',
        'upload.project_title':     'Title',
        'upload.title_ph':          'e.g. Topographic Map 1:25000',
        'upload.desc':              'Description',
        'upload.desc_ph':           'Optional',
        'upload.public':            'Public (visible to everyone)',
        'upload.geoservice':         'Include external geoservice layers',
        'upload.geoservice_hint':    'Adds WMS/WMTS/XYZ/raster layers defined in the QGIS project to the catalog (metadata only, no vector data extracted)',
        'upload.qgz':              'QGIS file (.qgz) *',
        'upload.data':              'Companion data files (GeoPackage, GeoJSON, Shapefile…)',
        'upload.err.name':          'Project name is required',
        'upload.err.file':          'Select a .qgz file',
        'upload.progress':          'Uploading…',
        'upload.progress2':         'Upload and migration in progress… (may take 30s)',
        'upload.cancel':            'Cancel',
        'upload.submit':            '📤 Upload',
        'upload.submitting':        'Uploading…',

        'delete.title':             '⚠️ Confirm deletion',
        'delete.desc':              'You are about to permanently delete the project <strong>{name}</strong> and all its data.',
        'delete.irreversible':      'This action is <strong>irreversible</strong>.',
        'delete.prompt':            'To confirm, type the project name:',
        'delete.cancel':            'Cancel',
        'delete.confirm':           '🗑 Delete permanently',

        'projects.upload':          '📤 Upload project',
        'projects.col.name':        'Name',
        'projects.col.title':       'Title',
        'projects.col.owner':       'Owner',
        'projects.col.crs':         'CRS',
        'projects.col.size':        'Size',
        'projects.col.updated':     'Updated',
        'projects.col.actions':     'Actions',
        'projects.empty':           'No projects. Use the "Upload project" button to get started.',
        'projects.delete':          '🗑 Delete',

        'userprojects.desc':        'Projects uploaded in your account.',
        'userprojects.empty':       'No projects.',

        'loading':                  'Loading…',
        'error':                    'Error: ',
    },

    fr: {
        'header.subtitle':          'Panneau de gestion',
        'header.logout':            'Déconnexion',
        'header.map':               '← Carte',

        'login.title':              'Dufour.app – Gestion',
        'login.username':           'Nom d\'utilisateur',
        'login.password':           'Mot de passe',
        'login.submit':             'Se connecter',
        'login.submitting':         'Connexion…',
        'login.forgot':             'Mot de passe oublié ?',

        'forgot.title':             'Mot de passe oublié',
        'forgot.desc':              'Saisissez l\'adresse email associée à votre compte. Vous recevrez un lien pour réinitialiser votre mot de passe.',
        'forgot.email':             'Email',
        'forgot.placeholder':       'nom@exemple.com',
        'forgot.submit':            'Envoyer le lien',
        'forgot.submitting':        'Envoi…',
        'forgot.back':              '← Retour à la connexion',
        'forgot.sent.title':        '📧 Vérifiez votre email',
        'forgot.sent.desc':         'Si l\'adresse <strong>{email}</strong> est associée à un compte, vous recevrez un email avec un lien pour réinitialiser votre mot de passe.',
        'forgot.sent.hint':         'Le lien est valable 30 minutes. Vérifiez aussi le dossier spam.',

        'reset.title':              'Nouveau mot de passe',
        'reset.desc':               'Choisissez un nouveau mot de passe pour votre compte.',
        'reset.password':           'Nouveau mot de passe',
        'reset.confirm':            'Confirmer le mot de passe',
        'reset.placeholder':        'Au moins 6 caractères',
        'reset.placeholder_confirm':'Répétez le mot de passe',
        'reset.submit':             'Réinitialiser',
        'reset.submitting':         'Enregistrement…',
        'reset.success.title':      '✅ Mot de passe réinitialisé !',
        'reset.success.desc':       'Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
        'reset.success.action':     'Aller à la connexion',
        'reset.err.mismatch':       'Les mots de passe ne correspondent pas',
        'reset.err.short':          'Le mot de passe doit comporter au moins 6 caractères',

        'tabs.users':               '👥 Utilisateurs',
        'tabs.projects':            '🗺 Projets',
        'tabs.myprojects':          '🗺 Mes projets',

        'users.new':                '+ Nouvel utilisateur',
        'users.col.username':       'Nom d\'utilisateur',
        'users.col.email':          'Email',
        'users.col.role':           'Rôle',
        'users.col.active':         'Actif',
        'users.col.created':        'Créé',
        'users.col.actions':        'Actions',
        'users.edit':               'Modifier',
        'users.delete':             'Supprimer',
        'users.confirm_delete':     'Supprimer l\'utilisateur « {name} » ?',

        'usermodal.new':            'Nouvel utilisateur',
        'usermodal.edit':           'Modifier : {name}',
        'usermodal.username':       'Nom d\'utilisateur',
        'usermodal.email':          'Email',
        'usermodal.role':           'Rôle',
        'usermodal.password_new':   'Mot de passe',
        'usermodal.password_edit':  'Nouveau mot de passe (laisser vide pour ne pas changer)',
        'usermodal.cancel':         'Annuler',
        'usermodal.save':           'Enregistrer',
        'usermodal.saving':         'Enregistrement…',

        'upload.title':             '📤 Charger un projet QGIS',
        'upload.name':              'Nom du projet *',
        'upload.name_ph':           'ex. my_project (seulement a-z, 0-9, _)',
        'upload.project_title':     'Titre',
        'upload.title_ph':          'ex. Carte topographique 1:25000',
        'upload.desc':              'Description',
        'upload.desc_ph':           'Optionnel',
        'upload.public':            'Public (visible par tous)',
        'upload.qgz':              'Fichier QGIS (.qgz) *',
        'upload.data':              'Fichiers de données (GeoPackage, GeoJSON, Shapefile…)',
        'upload.err.name':          'Le nom du projet est requis',
        'upload.err.file':          'Sélectionnez un fichier .qgz',
        'upload.progress':          'Téléchargement en cours…',
        'upload.progress2':         'Upload et migration en cours… (peut prendre 30s)',
        'upload.cancel':            'Annuler',
        'upload.submit':            '📤 Charger',
        'upload.submitting':        'Chargement…',

        'delete.title':             '⚠️ Confirmer la suppression',
        'delete.desc':              'Vous êtes sur le point de supprimer définitivement le projet <strong>{name}</strong> et toutes ses données.',
        'delete.irreversible':      'Cette opération est <strong>irréversible</strong>.',
        'delete.prompt':            'Pour confirmer, tapez le nom du projet :',
        'delete.cancel':            'Annuler',
        'delete.confirm':           '🗑 Supprimer définitivement',

        'projects.upload':          '📤 Charger un projet',
        'projects.col.name':        'Nom',
        'projects.col.title':       'Titre',
        'projects.col.owner':       'Propriétaire',
        'projects.col.crs':         'CRS',
        'projects.col.size':        'Taille',
        'projects.col.updated':     'Mis à jour',
        'projects.col.actions':     'Actions',
        'projects.empty':           'Aucun projet. Utilisez le bouton « Charger un projet » pour commencer.',
        'projects.delete':          '🗑 Supprimer',

        'userprojects.desc':        'Les projets chargés dans votre compte.',
        'userprojects.empty':       'Aucun projet.',

        'loading':                  'Chargement…',
        'error':                    'Erreur : ',
    },

    de: {
        'header.subtitle':          'Verwaltungspanel',
        'header.logout':            'Abmelden',
        'header.map':               '← Karte',

        'login.title':              'Dufour.app – Verwaltung',
        'login.username':           'Benutzername',
        'login.password':           'Passwort',
        'login.submit':             'Anmelden',
        'login.submitting':         'Anmeldung…',
        'login.forgot':             'Passwort vergessen?',

        'forgot.title':             'Passwort vergessen',
        'forgot.desc':              'Geben Sie die E-Mail-Adresse Ihres Kontos ein. Sie erhalten einen Link zum Zurücksetzen Ihres Passworts.',
        'forgot.email':             'E-Mail',
        'forgot.placeholder':       'name@beispiel.com',
        'forgot.submit':            'Reset-Link senden',
        'forgot.submitting':        'Senden…',
        'forgot.back':              '← Zurück zum Login',
        'forgot.sent.title':        '📧 Prüfen Sie Ihre E-Mails',
        'forgot.sent.desc':         'Falls die Adresse <strong>{email}</strong> mit einem Konto verknüpft ist, erhalten Sie eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts.',
        'forgot.sent.hint':         'Der Link ist 30 Minuten gültig. Prüfen Sie auch den Spam-Ordner.',

        'reset.title':              'Neues Passwort',
        'reset.desc':               'Wählen Sie ein neues Passwort für Ihr Konto.',
        'reset.password':           'Neues Passwort',
        'reset.confirm':            'Passwort bestätigen',
        'reset.placeholder':        'Mindestens 6 Zeichen',
        'reset.placeholder_confirm':'Passwort wiederholen',
        'reset.submit':             'Passwort zurücksetzen',
        'reset.submitting':         'Speichern…',
        'reset.success.title':      '✅ Passwort zurückgesetzt!',
        'reset.success.desc':       'Ihr Passwort wurde erfolgreich geändert. Sie können sich jetzt mit dem neuen Passwort anmelden.',
        'reset.success.action':     'Zum Login',
        'reset.err.mismatch':       'Passwörter stimmen nicht überein',
        'reset.err.short':          'Passwort muss mindestens 6 Zeichen lang sein',

        'tabs.users':               '👥 Benutzer',
        'tabs.projects':            '🗺 Projekte',
        'tabs.myprojects':          '🗺 Meine Projekte',

        'users.new':                '+ Neuer Benutzer',
        'users.col.username':       'Benutzername',
        'users.col.email':          'E-Mail',
        'users.col.role':           'Rolle',
        'users.col.active':         'Aktiv',
        'users.col.created':        'Erstellt',
        'users.col.actions':        'Aktionen',
        'users.edit':               'Bearbeiten',
        'users.delete':             'Löschen',
        'users.confirm_delete':     'Benutzer „{name}" löschen?',

        'usermodal.new':            'Neuer Benutzer',
        'usermodal.edit':           'Bearbeiten: {name}',
        'usermodal.username':       'Benutzername',
        'usermodal.email':          'E-Mail',
        'usermodal.role':           'Rolle',
        'usermodal.password_new':   'Passwort',
        'usermodal.password_edit':  'Neues Passwort (leer lassen, um es nicht zu ändern)',
        'usermodal.cancel':         'Abbrechen',
        'usermodal.save':           'Speichern',
        'usermodal.saving':         'Speichern…',

        'upload.title':             '📤 QGIS-Projekt hochladen',
        'upload.name':              'Projektname *',
        'upload.name_ph':           'z.B. my_project (nur a-z, 0-9, _)',
        'upload.project_title':     'Titel',
        'upload.title_ph':          'z.B. Topographische Karte 1:25000',
        'upload.desc':              'Beschreibung',
        'upload.desc_ph':           'Optional',
        'upload.public':            'Öffentlich (für alle sichtbar)',
        'upload.qgz':              'QGIS-Datei (.qgz) *',
        'upload.data':              'Begleitdateien (GeoPackage, GeoJSON, Shapefile…)',
        'upload.err.name':          'Projektname ist erforderlich',
        'upload.err.file':          'Wählen Sie eine .qgz-Datei',
        'upload.progress':          'Hochladen…',
        'upload.progress2':         'Upload und Migration… (kann 30s dauern)',
        'upload.cancel':            'Abbrechen',
        'upload.submit':            '📤 Hochladen',
        'upload.submitting':        'Hochladen…',

        'delete.title':             '⚠️ Löschen bestätigen',
        'delete.desc':              'Sie sind dabei, das Projekt <strong>{name}</strong> und alle zugehörigen Daten endgültig zu löschen.',
        'delete.irreversible':      'Dieser Vorgang ist <strong>nicht rückgängig zu machen</strong>.',
        'delete.prompt':            'Zur Bestätigung den Projektnamen eingeben:',
        'delete.cancel':            'Abbrechen',
        'delete.confirm':           '🗑 Endgültig löschen',

        'projects.upload':          '📤 Projekt hochladen',
        'projects.col.name':        'Name',
        'projects.col.title':       'Titel',
        'projects.col.owner':       'Eigentümer',
        'projects.col.crs':         'CRS',
        'projects.col.size':        'Grösse',
        'projects.col.updated':     'Aktualisiert',
        'projects.col.actions':     'Aktionen',
        'projects.empty':           'Keine Projekte. Nutzen Sie die Schaltfläche „Projekt hochladen", um zu beginnen.',
        'projects.delete':          '🗑 Löschen',

        'userprojects.desc':        'Die in Ihrem Konto hochgeladenen Projekte.',
        'userprojects.empty':       'Keine Projekte.',

        'tabs.fleet':                '🛰 Flotte',
        'fleet.sub.devices':         'Geräte',
        'fleet.sub.groups':          'Flotten',
        'fleet.sub.projects':        'Projektzuweisung',
        'fleet.devices.new':         '+ Neues Gerät',
        'fleet.devices.col.name':    'Name',
        'fleet.devices.col.id':      'Kennung',
        'fleet.devices.col.group':   'Flotte',
        'fleet.devices.col.status':  'Status',
        'fleet.devices.col.last':    'Letzte Aktualisierung',
        'fleet.devices.col.actions': 'Aktionen',
        'fleet.devices.edit':        'Bearbeiten',
        'fleet.devices.delete':      '🗑 Löschen',
        'fleet.devices.confirm':     'Gerät „{name}" löschen?',
        'fleet.groups.new':          '+ Neue Flotte',
        'fleet.groups.col.name':     'Name',
        'fleet.groups.col.actions':  'Aktionen',
        'fleet.groups.edit':         'Bearbeiten',
        'fleet.groups.delete':       '🗑 Löschen',
        'fleet.groups.confirm':      'Flotte „{name}" löschen?',
        'fleet.projects.desc':       'Verknüpfen Sie Traccar-Geräte oder -Flotten mit Projekten, um die auf der Karte sichtbaren Positionen zu filtern.',
        'fleet.projects.select':     'Projekt auswählen…',
        'fleet.projects.add_device': '+ Gerät',
        'fleet.projects.add_group':  '+ Flotte',
        'fleet.projects.remove':     '✕',
        'fleet.projects.empty':      'Kein Gerät/Flotte verknüpft.',
        'fleet.projects.type.device':'Gerät',
        'fleet.projects.type.group': 'Flotte',
        'fleet.modal.device.new':    'Neues Gerät',
        'fleet.modal.device.edit':   'Gerät bearbeiten',
        'fleet.modal.device.name':   'Name',
        'fleet.modal.device.id':     'Eindeutige Kennung (IMEI / OsmAnd-ID)',
        'fleet.modal.device.group':  'Flotte (optional)',
        'fleet.modal.device.cat':    'Kategorie',
        'fleet.modal.device.phone':  'Telefon',
        'fleet.modal.device.model':  'Modell',
        'fleet.modal.group.new':     'Neue Flotte',
        'fleet.modal.group.edit':    'Flotte bearbeiten',
        'fleet.modal.group.name':    'Flottenname',
        'fleet.modal.cancel':        'Abbrechen',
        'fleet.modal.save':          'Speichern',
        'fleet.modal.saving':        'Speichern…',
        'fleet.chooser.device':      'Gerät zum Hinzufügen auswählen',
        'fleet.chooser.group':       'Flotte zum Hinzufügen auswählen',
        'fleet.chooser.add':         'Hinzufügen',
        'fleet.status.online':       '🟢 Online',
        'fleet.status.offline':      '🔴 Offline',
        'fleet.status.unknown':      '⚪ Unbekannt',

        'loading':                  'Laden…',
        'error':                    'Fehler: ',
    },
};

// ---------------------------------------------------------------------------
// Language config
// ---------------------------------------------------------------------------
const LANGS = [
    {code: 'it', label: 'Italiano',  flag: '🇮🇹'},
    {code: 'en', label: 'English',   flag: '🇬🇧'},
    {code: 'fr', label: 'Français',  flag: '🇫🇷'},
    {code: 'de', label: 'Deutsch',   flag: '🇨🇭'},
];

const LS_LANG_KEY = 'dufour_admin_lang';

function detectLang() {
    const saved = localStorage.getItem(LS_LANG_KEY);
    if (saved && messages[saved]) return saved;
    const nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (messages[nav]) return nav;
    return 'en';
}

// ---------------------------------------------------------------------------
// React context + hook
// ---------------------------------------------------------------------------
const I18nCtx = createContext(null);

export function I18nProvider({children}) {
    const [lang, setLangState] = useState(detectLang);

    const setLang = useCallback((l) => {
        localStorage.setItem(LS_LANG_KEY, l);
        document.documentElement.lang = l;
        setLangState(l);
    }, []);

    // Sync html lang attribute on mount
    React.useEffect(() => { document.documentElement.lang = lang; }, []);

    /**
     * Translation function.
     * Supports simple {key} interpolation:  t('forgot.sent.desc', {email: 'a@b.c'})
     */
    const t = useCallback((key, vars) => {
        let s = (messages[lang] || messages.en)[key] || (messages.en)[key] || key;
        if (vars) {
            for (const [k, v] of Object.entries(vars)) {
                s = s.replaceAll(`{${k}}`, v);
            }
        }
        return s;
    }, [lang]);

    return (
        <I18nCtx.Provider value={{t, lang, setLang, LANGS}}>
            {children}
        </I18nCtx.Provider>
    );
}

export function useI18n() {
    return useContext(I18nCtx);
}
