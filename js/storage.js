// cardpack — localStorage 저장 (모든 접근을 try/catch로 감싼다)
(function (root) {
  const SAVE_KEY = 'cardpack.save.v3';
  const META_KEY = 'cardpack.meta.v3';

  function read(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 저장소 사용 불가 */ }
  }

  root.CPStore = {
    loadMeta: () => read(META_KEY),
    saveMeta: meta => write(META_KEY, meta),
    loadGame: () => read(SAVE_KEY),
    saveGame: state => write(SAVE_KEY, state),
    clearGame: () => remove(SAVE_KEY),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
