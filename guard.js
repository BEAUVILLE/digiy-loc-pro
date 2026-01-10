/* guard.js — DIGIY LOC PRO (SAFE, TERRAIN-FIRST, NO-CRASH)
   - Garantit window.DIGIY_GUARD
   - Lit slug depuis URL (?slug=) ou localStorage
   - Fallback propre si Supabase/RPC indispo
*/
(function(){
  "use strict";

  // =============================
  // GLOBAL SAFE EXPORT (always)
  // =============================
  const G = (window.DIGIY_GUARD = window.DIGIY_GUARD || {});

  // Basic logger (quiet on prod if needed)
  const log = (...a)=>console.log("%c[DIGIY_GUARD]","color:#22c55e;font-weight:700",...a);
  const warn = (...a)=>console.warn("%c[DIGIY_GUARD]","color:#f59e0b;font-weight:700",...a);
  const err = (...a)=>console.error("%c[DIGIY_GUARD]","color:#ef4444;font-weight:700",...a);

  // =============================
  // HELPERS
  // =============================
  function qs(name){
    try { return new URL(location.href).searchParams.get(name) || ""; }
    catch(e){ return ""; }
  }
  function getSlug(){
    const s = (qs("slug") || "").trim();
    if (s) {
      try { localStorage.setItem("digiy_loc_slug", s); } catch(_){}
      return s;
    }
    try { return (localStorage.getItem("digiy_loc_slug") || "").trim(); } catch(_){}
    return "";
  }
  function withSlug(url){
    const slug = getSlug();
    if (!slug) return url;
    try{
      const u = new URL(url, location.origin);
      if (!u.searchParams.get("slug")) u.searchParams.set("slug", slug);
      return u.pathname + "?" + u.searchParams.toString();
    }catch(_){
      // relative
      return url + (url.includes("?") ? "&" : "?") + "slug=" + encodeURIComponent(slug);
    }
  }

  function gotoLogin(reason){
    const dest = withSlug("login.html");
    warn(reason || "Retour login", "->", dest);
    location.replace(dest);
  }

  // =============================
  // PUBLIC API
  // =============================
  G.version = "loc-pro-guard-v1";
  G.getSlug = getSlug;
  G.withSlug = withSlug;

  // Minimal session store (phone + flag)
  G.getSession = function(){
    try{
      const raw = localStorage.getItem("digiy_loc_session") || "";
      return raw ? JSON.parse(raw) : null;
    }catch(_){ return null; }
  };

  G.setSession = function(obj){
    try{
      localStorage.setItem("digiy_loc_session", JSON.stringify(obj || {}));
      return true;
    }catch(_){ return false; }
  };

  G.clearSession = function(){
    try{ localStorage.removeItem("digiy_loc_session"); }catch(_){}
  };

  // The only guard check used by pages
  // It will NEVER throw; it returns {ok:boolean, reason:string}
  G.checkAccess = async function(options){
    const opts = options || {};
    const requireSlug = opts.requireSlug !== false; // default true
    const requireSession = opts.requireSession !== false; // default true

    const slug = getSlug();
    if (requireSlug && !slug) {
      return { ok:false, reason:"Slug manquant. Exemple: login.html?slug=chez-astou-saly" };
    }

    if (requireSession) {
      const s = G.getSession();
      if (!s || !s.phone) {
        return { ok:false, reason:"Session absente (téléphone/PIN non validés)" };
      }
    }

    // Optional: if you later want subscription checks, plug them here
    // For now, DO NOT invent RPC. Keep safe and return ok.
    return { ok:true, reason:"OK" };
  };

  // Convenience: pages call ensureAccess() to redirect automatically
  G.ensureAccess = async function(options){
    try{
      const res = await G.checkAccess(options);
      if (!res.ok) {
        gotoLogin(res.reason);
        return false;
      }
      return true;
    }catch(e){
      err("Erreur guard inattendue", e);
      gotoLogin("Erreur guard");
      return false;
    }
  };

  // Debug ping
  G.ping = function(){
    log("loaded", G.version, "slug=", getSlug());
    return { loaded:true, version:G.version, slug:getSlug() };
  };

  // Auto-log when loaded
  try { log("guard.js chargé ✅", "version:", G.version, "slug:", getSlug() || "(vide)"); }
  catch(_){}
})();
