/* =========================
   DIGIY GUARD — UNIVERSAL (GitHub Pages safe)
   ✅ Supabase Auth + digiy_profiles mapping + is_module_active(auth.uid(), module)
   ✅ Auto-sync phone -> digiy_profiles via ensure_profile_phone()
========================= */
(function(){
  "use strict";

  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  // -------------------------
  // Helpers
  // -------------------------
  function getBase(){
    const path = location.pathname || "/";
    const parts = path.split("/").filter(Boolean);
    return (parts.length >= 1) ? ("/" + parts[0]) : "";
  }

  function normPhone(p){
    p = String(p||"").trim().replace(/\s+/g,"").replace(/[^\d+]/g,"");
    if(p.startsWith("00221")) p = "+221" + p.slice(5);
    if(!p.startsWith("+") && p.startsWith("221")) p = "+" + p;
    if(!p.startsWith("+221") && /^\d{9}$/.test(p)) p = "+221" + p;
    return p;
  }

  function getPhone(){
    const s =
      sessionStorage.getItem("digiy_phone") ||
      sessionStorage.getItem("digiy_driver_phone");
    if (s) return s;

    try{
      const a = JSON.parse(localStorage.getItem("digiy_access_pin")||"null");
      if(a?.phone) return a.phone;
    }catch(_){}

    try{
      const b = JSON.parse(localStorage.getItem("digiy_driver_access_pin")||"null");
      if(b?.phone) return b.phone;
    }catch(_){}

    return null;
  }

  function setPhone(phone){
    const p = normPhone(phone);
    sessionStorage.setItem("digiy_phone", p);
    sessionStorage.setItem("digiy_driver_phone", p);
    try{
      localStorage.setItem("digiy_access_pin", JSON.stringify({ phone: p }));
      localStorage.setItem("digiy_driver_access_pin", JSON.stringify({ phone: p }));
    }catch(_){}
    return p;
  }

  function getSB(){
    if(window.__sb) return window.__sb;
    if(!window.supabase?.createClient) throw new Error("Supabase JS not loaded");
    window.__sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__sb;
  }

  function go(url){ location.replace(url); }

  // -------------------------
  // New: Auth + Profiles + Active module
  // Requires on Supabase:
  //   - RPC ensure_profile_phone(p_phone text)
  //   - RPC is_module_active(p_user_id uuid, p_module text)
  // -------------------------
  async function getUser(){
    const supabase = getSB();
    const { data, error } = await supabase.auth.getUser();
    if(error) throw error;
    return data?.user || null;
  }

  async function ensureProfilePhone(phone){
    const supabase = getSB();
    const { error } = await supabase.rpc("ensure_profile_phone", { p_phone: phone });
    if(error) throw error;
  }

  async function isActiveByUser(userId, module){
    const supabase = getSB();
    const { data, error } = await supabase.rpc("is_module_active", {
      p_user_id: userId,
      p_module: module
    });
    if(error) throw error;
    return !!data;
  }

  // -------------------------
  // Boot
  // cfg = { module:"LOC", dashboard:"/xxx.html", login:"/auth.html", pay:"https://..." }
  // -------------------------
  async function boot(cfg){
    const BASE = getBase();
    const module = String(cfg.module || "").trim();  // IMPORTANT: use "LOC", "DRIVER", "PAY" (uppercase recommended)
    const dashboard = cfg.dashboard || (BASE + "/");
    const login = cfg.login || (BASE + "/login.html");
    const pay = cfg.pay || "https://beauville.github.io/commencer-a-payer/";

    // 1) Need local phone (PIN flow) to sync profile
    const rawPhone = getPhone();
    if(!rawPhone){
      go(login);
      return;
    }
    const phone = setPhone(rawPhone);

    try{
      // 2) Need Supabase Auth session
      const user = await getUser();
      if(!user){
        // Not logged in via Supabase Auth -> go login
        go(login);
        return;
      }

      // 3) Sync phone to digiy_profiles (user_id -> phone_number)
      await ensureProfilePhone(phone);

      // 4) Check subscription active by auth user id
      const ok = await isActiveByUser(user.id, module);

      if(!ok){
        const from = location.href;
        go(
          pay
          + "?module=" + encodeURIComponent(module)
          + "&phone=" + encodeURIComponent(phone)
          + "&from=" + encodeURIComponent(from)
        );
        return;
      }

      // 5) OK -> dashboard
      go(dashboard);

    }catch(e){
      // If something fails, we do NOT silently allow access (safer)
      console.warn("GUARD error:", e);
      go(login);
    }
  }

  window.DIGIY_GUARD = { boot, getPhone, setPhone, normPhone };
})();

