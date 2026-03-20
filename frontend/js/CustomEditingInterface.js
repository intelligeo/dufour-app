/**
 * CustomEditingInterface.js
 *
 * Estende QWC2's default EditingInterface iniettando automaticamente
 * il JWT Bearer token (salvato dal pannello Admin in localStorage
 * sotto la chiave 'dufour_admin_token') nelle richieste axios.
 *
 * Questo permette a EditingPlugin, FeatureFormPlugin, AttributeTablePlugin
 * e ObjectListPlugin di chiamare i nostri endpoint /api/v1/data/* che
 * richiedono autenticazione JWT per le operazioni di scrittura.
 */
import axios from 'axios';
import EditingInterface from 'qwc2/utils/EditingInterface';

/** Chiave usata dall'Admin panel per salvare il token JWT in localStorage. */
const LS_TOKEN_KEY = 'dufour_admin_token';

/**
 * Recupera il token JWT da localStorage e lo imposta come header
 * globale di axios.  Se non è presente, rimuove l'header così le
 * richieste anonime funzionano normalmente (lettura pubblica).
 */
function injectAuthHeader() {
    const token = localStorage.getItem(LS_TOKEN_KEY);
    if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        delete axios.defaults.headers.common['Authorization'];
    }
}

// Imposta l'header subito al caricamento del modulo (se già loggati)
injectAuthHeader();

const CustomEditingInterface = {
    ...EditingInterface,

    getFeature(editConfig, mapPos, mapCrs, mapScale, dpi, callback, filter, filterGeom) {
        injectAuthHeader();
        return EditingInterface.getFeature(editConfig, mapPos, mapCrs, mapScale, dpi, callback, filter, filterGeom);
    },

    getFeatureById(editConfig, featureId, mapCrs, callback) {
        injectAuthHeader();
        return EditingInterface.getFeatureById(editConfig, featureId, mapCrs, callback);
    },

    getFeatures(editConfig, mapCrs, callback, options) {
        injectAuthHeader();
        return EditingInterface.getFeatures(editConfig, mapCrs, callback, options);
    },

    getExtent(editConfig, mapCrs, callback, filter, filterGeom) {
        injectAuthHeader();
        return EditingInterface.getExtent(editConfig, mapCrs, callback, filter, filterGeom);
    },

    addFeatureMultipart(editConfig, mapCrs, featureData, callback) {
        injectAuthHeader();
        return EditingInterface.addFeatureMultipart(editConfig, mapCrs, featureData, callback);
    },

    editFeatureMultipart(editConfig, mapCrs, featureId, featureData, callback) {
        injectAuthHeader();
        return EditingInterface.editFeatureMultipart(editConfig, mapCrs, featureId, featureData, callback);
    },

    deleteFeature(editConfig, featureId, callback, recaptchaResponse) {
        injectAuthHeader();
        return EditingInterface.deleteFeature(editConfig, featureId, callback, recaptchaResponse);
    },

    getRelations(editConfig, featureId, mapCrs, tables, editConfigs, callback) {
        injectAuthHeader();
        return EditingInterface.getRelations(editConfig, featureId, mapCrs, tables, editConfigs, callback);
    },

    getKeyValues(keyvalues, callback, filter) {
        injectAuthHeader();
        return EditingInterface.getKeyValues(keyvalues, callback, filter);
    },
};

export default CustomEditingInterface;
