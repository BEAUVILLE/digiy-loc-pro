/* =========================
   DIGIY LOC PRO GUARD — GitHub Pages SAFE
   - RPC: verify_access_pin(p_phone,p_pin,p_module) -> json
   - RPC optional: is_module_active(p_phone,p_module) -> bool
   - ✅ Always keeps redirects inside /digiy-loc-pro/ via RELATIVE paths
   - ✅ Exposes window.DIGIY_GUARD (compat)
   - ✅ Keeps ?slug=... across pages
========================= */
(function(){
  "use strict";

  // =============================
  // SUPABASE
  // =============================
  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  const KEY = {
    phone: "digiy_phone",
    sess:  "digiy_loc_pro_session", // { phone, ok, token?, exp }
    slug:  "digiy_loc_slug"
  };

  // =============================
  // URL / SLUG helpers
  // =============================
  function qs(name){
    try { return new URL(location.href).searchParams.get(name) || ""; }
    catch(_){ return ""; }
  }

  function getSlug(){
    const s = String(qs("slug") || "").trim();
    if (s) { try { localStorage.setItem(KEY.slug, s); } catch(_){} return s; }
    try { return String(localStorage.getItem(KEY.slug) || "").trim(); } catch(_){}
    return "";
  }

  function withSlug(url){
    const slug = getSlug();
    if (!slug) return url;
    try{
      const u = new URL(url, location.href); // ✅ resolves relative to current page (repo-safe)
      if (!u.searchParams.get("slug")) u.searchParams.set("slug", slug);
      return u.toString();
    }catch(_){
      return url + (url.includes("?") ? "&" : "?") + "slug=" + encodeURIComponent(slug);
    }
  }

  // ✅ Always redirect using RELATIVE (repo-safe)
  function go(url){
    location.replace(withSlug(url));
  }

  // =============================
  // PHONE / SESSION
  // =============================
  function normPhone(p){
    p = String(p||"").trim().replace(/\s+/g,"").replace(/[^\d+]/g,"");
    if(p.startsWith("00221")) p = "+221" + p.slice(5);
    if(!p.startsWith("+") && p.startsWith("221")) p = "+" + p;
    if(!p.startsWith("+221") && /^\d{9}$/.test(p)) p = "+221" + p;
    return p;
  }

  function getSB(){
    if(window.__sb) return window.__sb;
    if(!window.supabase?.createClient) throw new Error("Supabase JS not loaded (add supabase-js before guard.js)");
    window.__sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__sb;
  }

  function getPhone(){
    const s = sessionStorage.getItem(KEY.phone) || sessionStorage.getItem("digiy_driver_phone");
    if(s) return s;
    try{
      const obj = JSON.parse(localStorage.getItem(KEY.sess)||"null");
      if(obj?.phone) return obj.phone;
    }catch(_){}
    return null;
  }

  function setPhone(phone){
    const p = normPhone(phone);
    sessionStorage.setItem(KEY.phone, p);
    sessionStorage.setItem("digiy_driver_phone", p);
    try{
      localStorage.setItem("digiy_access_pin", JSON.stringify({ phone: p }));
      localStorage.setItem("digiy_driver_access_pin", JSON.stringify({ phone: p }));
    }catch(_){}
    return p;
  }

  function getSession(){
    try{
      const s = JSON.parse(localStorage.getItem(KEY.sess)||"null");
      if(!s?.phone) return null;
      if(s?.exp && Date.now() > Number(s.exp)) return null;
      return s;
    }catch(_){ return null; }
  }

  function setSession(obj){
    const phone = normPhone(obj.phone);
    const exp = obj.exp ? Number(obj.exp) : (Date.now() + 1000*60*60*8);
    const sess = { phone, ok:true, token: obj.token ? String(obj.token) : null, exp };
    localStorage.setItem(KEY.sess, JSON.stringify(sess));
    setPhone(phone);
    return sess;
  }

  function clearSession(){
    try{ localStorage.removeItem(KEY.sess); }catch(_){}
    try{ sessionStorage.removeItem(KEY.phone); }catch(_){}
  }

  function sessionLooksValid(){
    const s = getSession();
    if(!s?.phone) return false;
    if(s.exp && Date.now() > Number(s.exp)) return false;
    return true;
  }

  // =============================
  // RPC
  // =============================
  async function rpcVerifyAccessPin(phone, pin, module){
    const sb = getSB();
    const { data, error } = await sb.rpc("verify_access_pin", {
      p_phone: phone, p_pin: pin, p_module: module
    });
    if(error) throw error;
    return data;
  }

  async function rpcIsModuleActive(phone, module){
    const sb = getSB();
    const { data, error } = await sb.rpc("is_module_active", {
      p_phone: phone, p_module: module
    });
    if(error) throw error;
    return !!data;
  }

  // =============================
  // PUBLIC
  // =============================
  async function boot(cfg){
    cfg = cfg || {};
    const module = String(cfg.module || "LOC").trim();
    const dashboard = cfg.dashboard || "./planning.html"; // ✅ RELATIVE
    const login = cfg.login || "./login.html";           // ✅ RELATIVE
    const pay = cfg.pay || "https://beauville.github.io/commencer-a-payer/";

    const requireSlug = (cfg.requireSlug !== false);
    const slug = getSlug();
    if (requireSlug && !slug) { go(login); return; }

    const phoneRaw = getPhone();
    if(!phoneRaw){ go(login); return; }
    const phone = setPhone(phoneRaw);

    if(!sessionLooksValid()){
      clearSession();
      go(login);
      return;
    }

    if (cfg.checkSubscription !== false) {
      try{
        const ok = await rpcIsModuleActive(phone, module);
        if(!ok){
          const from = location.href;
          location.replace(
            pay
            + "?module=" + encodeURIComponent(module)
            + "&phone=" + encodeURIComponent(phone)
            + "&from=" + encodeURIComponent(from)
            + (slug ? "&slug=" + encodeURIComponent(slug) : "")
          );
          return;
        }
      }catch(e){
        console.warn("is_module_active error:", e);
        clearSession();
        go(login);
        return;
      }
    }

    const dashName = String(dashboard).split("/").pop();
    if(dashName && location.pathname.endsWith(dashName)) return;
    go(dashboard);
  }

  async function loginWithPin(phone, pin, module){
    const p = setPhone(phone);
    const res = await rpcVerifyAccessPin(p, String(pin||""), String(module||"LOC"));

    const ok =
      (res === true) ||
      (res && typeof res === "object" && (res.ok === true || res.allowed === true || res.valid === true));

    if(!ok) return { ok:false, res };

    let exp = Date.now() + 1000*60*60*8;
    if(res && typeof res === "object"){
      if(res.exp_ms) exp = Date.now() + Number(res.exp_ms);
      if(res.exp) exp = Number(res.exp);
    }
    const token = (res && typeof res === "object" && res.token) ? String(res.token) : null;
    setSession({ phone: p, token, exp });
    return { ok:true, res };
  }

  const API = {
    boot,
    loginWithPin,
    getPhone,
    setPhone,
    getSession,
    setSession,
    clearSession,
    normPhone,
    getSlug,
    withSlug
  };

  window.DIGIY_LOC_PRO_GUARD = API;
  window.DIGIY_GUARD = API; // ✅ what your pages expect
})();
