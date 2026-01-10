/* =========================================================
   DIGIY LOC GUARD — PHONE+PIN + SESSION TOKEN (FULL)
   - Works on GitHub Pages / Static sites
   - No email auth
   - Requires Supabase RPC:
       1) digiy_access_pin_verify(p_phone, p_pin, p_module) -> { ok, phone, owner_id? }
       2) digiy_loc_session_create(p_phone, p_user_agent)   -> { ok, phone, token, exp_ms }
       3) digiy_loc_session_validate(p_phone, p_token)      -> boolean
       4) is_module_active(p_phone, p_module)               -> boolean
========================================================= */
(function(){
  "use strict";

  // =============================
  // CONFIG (DO NOT CHANGE unless needed)
  // =============================
  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  // Storage keys
  const KEY = {
    phone: "digiy_phone",
    sess:  "digiy_loc_session" // { phone, token, exp }
  };

  // =============================
  // UTILS
  // =============================
  function normPhone(p){
    p = String(p||"").trim().replace(/\s+/g,"").replace(/[^\d+]/g,"");
    if(p.startsWith("00221")) p = "+221" + p.slice(5);
    if(!p.startsWith("+") && p.startsWith("221")) p = "+" + p;
    if(!p.startsWith("+221") && /^\d{9}$/.test(p)) p = "+221" + p;
    return p;
  }

  function now(){ return Date.now(); }

  function safeJsonParse(s){
    try{ return JSON.parse(s); }catch(_){ return null; }
  }

  function go(url){
    try{ location.replace(url); }catch(_){ location.href = url; }
  }

  function withQuery(url, params){
    const u = new URL(url, location.href);
    Object.entries(params||{}).forEach(([k,v])=>{
      if(v===undefined || v===null || v==="") return;
      u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  // =============================
  // SUPABASE CLIENT
  // =============================
  function getSB(){
    if(window.__sb) return window.__sb;
    if(!window.supabase?.createClient) throw new Error("Supabase JS not loaded");
    window.__sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__sb;
  }

  // =============================
  // STORAGE
  // =============================
  function getPhone(){
    const s = sessionStorage.getItem(KEY.phone);
    if(s) return s;
    const sess = safeJsonParse(localStorage.getItem(KEY.sess) || "null");
    if(sess?.phone) return sess.phone;
    return null;
  }

  function setPhone(phone){
    const p = normPhone(phone);
    sessionStorage.setItem(KEY.phone, p);
    return p;
  }

  function getSession(){
    const s = safeJsonParse(localStorage.getItem(KEY.sess) || "null");
    if(!s?.token || !s?.phone || !s?.exp) return null;
    if(now() > Number(s.exp)) return null;
    return s;
  }

  function setSession({ phone, token, exp_ms }){
    const obj = {
      phone: normPhone(phone),
      token: String(token),
      exp: now() + Number(exp_ms || 0)
    };
    localStorage.setItem(KEY.sess, JSON.stringify(obj));
    setPhone(obj.phone);
    return obj;
  }

  function clearSession(){
    try{ localStorage.removeItem(KEY.sess); }catch(_){}
    try{ sessionStorage.removeItem(KEY.phone); }catch(_){}
  }

  // =============================
  // RPC CALLS
  // =============================
  async function rpc(name, args){
    const sb = getSB();
    const { data, error } = await sb.rpc(name, args || {});
    if(error) throw error;
    return data;
  }

  async function validateSession(){
    const sess = getSession();
    if(!sess) return false;
    const ok = await rpc("digiy_loc_session_validate", {
      p_phone: sess.phone,
      p_token: sess.token
    }).catch(()=>false);
    return !!ok;
  }

  async function isActive(phone, module){
    const ok = await rpc("is_module_active", { p_phone: phone, p_module: module });
    return !!ok;
  }

  // =============================
  // LOGIN FLOW (PHONE+PIN -> SESSION TOKEN)
  // =============================
  /**
   * Call this from login.html when user submits phone+pin.
   * Requires server-side RPC:
   *  - digiy_access_pin_verify(p_phone, p_pin, p_module) -> { ok, phone }
   *  - digiy_loc_session_create(p_phone, p_user_agent)   -> { ok, phone, token, exp_ms }
   */
  async function loginWithPin({ phone, pin, module }){
    const p = normPhone(phone);
    const m = String(module || "LOC").trim();

    if(!p || p.length < 8) throw new Error("Téléphone invalide");
    if(!pin || String(pin).trim().length < 3) throw new Error("PIN invalide");

    // 1) verify PIN (SERVER)
    const v = await rpc("digiy_access_pin_verify", {
      p_phone: p,
      p_pin: String(pin).trim(),
      p_module: m
    });

    if(!v || v.ok !== true) throw new Error("PIN incorrect");

    // 2) create session token (SERVER)
    const s = await rpc("digiy_loc_session_create", {
      p_phone: p,
      p_user_agent: (navigator.userAgent || null)
    });

    if(!s || s.ok !== true || !s.token) throw new Error("Session non créée");

    setSession({ phone: s.phone || p, token: s.token, exp_ms: s.exp_ms || (12*60*60*1000) });
    return { ok:true, phone: s.phone || p };
  }

  // =============================
  // GUARD BOOT (use on protected pages)
  // =============================
  async function boot(cfg){
    const module = String(cfg?.module || "LOC").trim();
    const dashboard = cfg?.dashboard || "./planning.html";
    const login = cfg?.login || "./login.html";
    const pay = cfg?.pay || "https://beauville.github.io/commencer-a-payer/";

    const phoneRaw = getPhone();
    if(!phoneRaw){ go(login); return; }
    const phone = setPhone(phoneRaw);

    // 1) must have valid session token
    const okSession = await validateSession();
    if(!okSession){
      clearSession();
      go(withQuery(login, { module, from: location.href, phone }));
      return;
    }

    // 2) must have active subscription
    const okSub = await isActive(phone, module).catch(()=>false);
    if(!okSub){
      go(withQuery(pay, { module, phone, from: location.href }));
      return;
    }

    // 3) if current page isn't dashboard, optionally redirect
    if(cfg?.forceDashboard){
      const dashName = String(dashboard).split("/").pop();
      if(dashName && !location.pathname.endsWith(dashName)){
        go(dashboard);
        return;
      }
    }

    // protected page can continue
    return true;
  }

  // =============================
  // EXPORT
  // =============================
  window.DIGIY_LOC_GUARD = {
    boot,
    loginWithPin,
    getPhone,
    setPhone,
    getSession,
    setSession,
    clearSession,
    normPhone
  };
})();
