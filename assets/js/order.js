// The request card: a floating request card that opens from any [data-order] trigger.
// No backend yet: set FORM_ENDPOINT to a URL that accepts a JSON POST to wire it up.
(() => {
  const FORM_ENDPOINT = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const now = new Date();
  const orderNo = `FA-${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}-${pad(Math.floor(1000 + Math.random() * 8999), 4)}`;
  const VOLUMES = ["sample only", "10 h", "50 h", "100 h", "250 h", "500 h", "1,000 h", "2,500 h", "5,000 h+"];
  const chip = (type, name, v, checked) => `<label><input type="${type}" name="${name}" value="${v}"${checked ? " checked" : ""} /><span>${v}</span></label>`;
  const MARK_UNUSED = `<svg viewBox="28 0 44 100" aria-hidden="true"><g><rect x="48.2" y="0" width="3.6" height="26"/><path d="M43 26 H57 L69 44 H31 Z"/><path d="M32.4 50 H67.6 L50 100 Z"/></g></svg>`;

  const html = `
  <button class="order-fab" type="button" data-order aria-label="Request data"><span>[ request data ]</span></button>
  <div class="order-veil" data-order-veil hidden></div>
  <div class="order" data-order-root hidden>
    <div class="order-float">
      <div class="order-card" role="dialog" aria-modal="true" aria-labelledby="order-h" tabindex="-1">
        <div class="order-head" data-order-drag>
          <div><h2 id="order-h">request_data</h2><p>req ${orderNo.toLowerCase()} · drag to move</p></div>
          <button class="order-x" type="button" data-order-close aria-label="Close"><svg viewBox="0 0 12 12"><path d="M1 1 L11 11 M11 1 L1 11"/></svg></button>
        </div>
        <form class="order-form" novalidate data-order-form>
          <div class="order-body">
            <fieldset class="of" data-req="needs">
              <legend><span>01</span>what do you need? <em class="hint">pick any</em></legend>
              <div class="chips">${["first-person video", "hand pose", "force & touch", "depth & 3d", "machine telemetry", "action labels", "custom dataset", "not sure yet"].map((v) => chip("checkbox", "needs", v)).join("")}</div>
              <p class="err">! choose at least one, or "not sure yet".</p>
            </fieldset>
            <fieldset class="of">
              <legend><span>02</span>what setting?</legend>
              <div class="chips">${["home", "workplace", "outdoors", "lab", "other"].map((v) => chip("checkbox", "settings", v)).join("")}</div>
            </fieldset>
            <fieldset class="of">
              <legend><span>03</span>how much data?</legend>
              <div class="vol">
                <div class="vol-read"><b data-vol-read>sample only</b><span>of labelled data</span></div>
                <input type="range" min="0" max="${VOLUMES.length - 1}" step="1" value="0" name="volume_step" aria-label="How much footage" data-vol />
                <div class="vol-ticks" aria-hidden="true"><span>sample</span><span>100 h</span><span>1,000 h</span><span>5,000 h+</span></div>
              </div>
            </fieldset>
            <fieldset class="of">
              <legend><span>04</span>when do you need it?</legend>
              <div class="chips">${["exploring", "within a month", "this quarter", "later this year"].map((v, i) => chip("radio", "timeline", v, i === 0)).join("")}</div>
            </fieldset>
            <div class="of" data-req="building">
              <div class="inp"><textarea id="o-building" name="building" rows="3" placeholder=" " required></textarea><label for="o-building">what are you building?</label><i></i></div>
              <p class="err">! tell us a little about the model and the tasks it should learn.</p>
            </div>
            <div class="of">
              <div class="inp"><input id="o-footage" name="own_footage" placeholder=" " /><label for="o-footage">data you already have <small>(optional)</small></label><i></i></div>
            </div>
            <fieldset class="of">
              <legend><span>05</span>about you</legend>
              <div class="two">
                <div data-req="name"><div class="inp"><input id="o-name" name="name" autocomplete="name" placeholder=" " required /><label for="o-name">name</label><i></i></div><p class="err">! enter your name.</p></div>
                <div data-req="email"><div class="inp"><input id="o-email" name="email" type="email" autocomplete="email" placeholder=" " required /><label for="o-email">work email</label><i></i></div><p class="err">! enter a work email, like name@company.com.</p></div>
                <div><div class="inp"><input id="o-company" name="company" autocomplete="organization" placeholder=" " /><label for="o-company">company or lab</label><i></i></div></div>
                <div><div class="inp"><input id="o-role" name="role" autocomplete="organization-title" placeholder=" " /><label for="o-role">role <small>(optional)</small></label><i></i></div></div>
              </div>
            </fieldset>
          </div>
          <div class="order-foot">
            <p>reply within<br /><b>2 business days</b></p>
            <button class="btn ink" type="submit" data-order-submit>send --request <i aria-hidden="true">↵</i></button>
          </div>
        </form>
        <div class="order-done" data-order-done hidden tabindex="-1">
          <p class="stamp" data-stamp>[ ok ] received</p>
          <h3>thanks, <span data-done-name></span>.</h3>
          <p>your request is in. we'll reply within two business days with a sample matched to what you described.</p>
          <dl class="receipt" data-receipt></dl>
          <button class="btn ink" type="button" data-order-close>close</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);

  const root = document.querySelector("[data-order-root]"), veil = document.querySelector("[data-order-veil]");
  const floater = root.querySelector(".order-float"), card = root.querySelector(".order-card");
  const form = root.querySelector("[data-order-form]"), done = root.querySelector("[data-order-done]");
  const fab = document.querySelector(".order-fab");
  const vol = root.querySelector("[data-vol]"), volRead = root.querySelector("[data-vol-read]");
  let opener = null, isOpen = false, bob = null;

  // ── volume slider ──
  const setVol = () => { volRead.textContent = VOLUMES[+vol.value]; vol.style.setProperty("--fill", (vol.value / vol.max) * 100 + "%"); };
  vol.addEventListener("input", setVol); setVol();

  // ── open / close ──
  function rectOf(el) { const r = (el && el.getClientRects().length ? el : fab).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function open(trigger) {
    if (isOpen) return;
    isOpen = true; opener = trigger || null;
    root.hidden = false; veil.hidden = false;
    document.body.classList.add("locked"); fab.classList.add("hide");
    requestAnimationFrame(() => veil.classList.add("open"));
    const from = rectOf(trigger), to = card.getBoundingClientRect();
    const dx = from.x - (to.left + to.width / 2), dy = from.y - (to.top + to.height / 2);
    if (!reduced) {
      card.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(-6deg)`, opacity: 0, filter: "blur(6px)" },
        { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1, filter: "blur(0)" }],
        { duration: 720, easing: "cubic-bezier(.34,1.32,.5,1)" });
      root.querySelectorAll(".of, .order-foot").forEach((el, i) => el.animate(
        [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
        { duration: 520, delay: 180 + i * 45, easing: "cubic-bezier(.2,.7,.1,1)", fill: "backwards" }));
      bob = floater.animate([{ transform: "translateY(0)" }, { transform: "translateY(-5px)" }, { transform: "translateY(0)" }],
        { duration: 4200, iterations: Infinity, easing: "ease-in-out", delay: 800 });
    }
    setTimeout(() => (done.hidden ? card : done).focus({ preventScroll: true }), reduced ? 0 : 380);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    veil.classList.remove("open");
    const finish = () => {
      root.hidden = true; veil.hidden = true; document.body.classList.remove("locked"); fab.classList.remove("hide");
      if (bob) bob.cancel();
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };
    if (reduced) return finish();
    const to = rectOf(opener && opener.offsetParent ? opener : fab), r = card.getBoundingClientRect();
    card.animate([{ transform: "none", opacity: 1 },
      { transform: `translate(${to.x - (r.left + r.width / 2)}px, ${to.y - (r.top + r.height / 2)}px) scale(.16) rotate(5deg)`, opacity: 0 }],
      { duration: 420, easing: "cubic-bezier(.6,0,.8,.4)" }).onfinish = finish;
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-order]");
    if (t) { e.preventDefault(); open(t); return; }
    if (e.target.closest("[data-order-close]")) close();
  });
  veil.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") {
      const f = [...card.querySelectorAll("button, input, textarea, [tabindex='-1']")].filter((el) => el.offsetParent && !el.closest("[hidden]") && el.tabIndex !== -1);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  if (location.hash === "#request") setTimeout(() => open(null), 600);

  // ── float: drag by the header, tilt toward the pointer ──
  let dx = 0, dy = 0, drag = null;
  const head = root.querySelector("[data-order-drag]");
  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    drag = { x: e.clientX - dx, y: e.clientY - dy }; head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = root.getBoundingClientRect(), bx = r.left - dx, by = r.top - dy;
    dx = Math.min(innerWidth - r.width - bx - 8, Math.max(8 - bx, e.clientX - drag.x));
    dy = Math.min(innerHeight - 90 - by, Math.max(8 - by, e.clientY - drag.y));
    root.style.translate = `${dx}px ${dy}px`;
  });
  head.addEventListener("pointerup", () => { drag = null; });
  if (matchMedia("(pointer: fine)").matches && !reduced) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const tick = () => { cx += (tx - cx) * .08; cy += (ty - cy) * .08; card.style.transform = `rotateX(${cy}deg) rotateY(${cx}deg)`; raf = Math.abs(tx - cx) + Math.abs(ty - cy) > .01 ? requestAnimationFrame(tick) : 0; };
    root.addEventListener("pointermove", (e) => {
      if (drag) return;
      const r = card.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - .5) * 3.2; ty = -((e.clientY - r.top) / r.height - .5) * 2.4;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    root.addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
  }

  // ── validate + send ──
  const req = (k) => root.querySelector(`[data-req="${k}"]`);
  const checks = {
    needs: () => form.querySelectorAll("[name=needs]:checked").length > 0,
    building: () => form.building.value.trim().length > 0,
    name: () => form.name.value.trim().length > 0,
    email: () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim()),
  };
  form.addEventListener("input", (e) => {
    const box = e.target.closest("[data-req]");
    if (box && box.classList.contains("invalid") && checks[box.dataset.req]()) box.classList.remove("invalid");
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = Object.keys(checks).filter((k) => !checks[k]());
    Object.keys(checks).forEach((k) => req(k).classList.toggle("invalid", bad.includes(k)));
    if (bad.length) {
      const first = req(bad[0]); first.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      (first.querySelector("input, textarea") || first).focus({ preventScroll: true });
      if (!reduced) card.animate([{ translate: "0" }, { translate: "-8px" }, { translate: "7px" }, { translate: "-4px" }, { translate: "0" }], { duration: 380 });
      return;
    }
    const fd = new FormData(form);
    const data = Object.fromEntries([...fd.keys()].map((k) => [k, fd.getAll(k).length > 1 ? fd.getAll(k) : fd.get(k)]));
    data.volume = VOLUMES[+vol.value]; data.order = orderNo; delete data.volume_step;
    const btn = form.querySelector("[data-order-submit]");
    btn.disabled = true; btn.firstChild.textContent = "sending… ";
    try {
      if (FORM_ENDPOINT) await fetch(FORM_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      else await new Promise((r) => setTimeout(r, 650));
    } catch (_) { /* keep the confirmation local-only until a backend exists */ }
    const list = (v) => [].concat(v || []).join(", ") || "—";
    root.querySelector("[data-done-name]").textContent = data.name.split(" ")[0];
    root.querySelector("[data-receipt]").innerHTML = [["req", orderNo], ["needs", list(data.needs)], ["setting", list(data.settings)], ["volume", data.volume], ["when", data.timeline]]
      .map(([k, v]) => `<div><dt>${k}</dt><dd></dd></div>`).join("");
    root.querySelectorAll("[data-receipt] dd").forEach((dd, i) => { dd.textContent = [orderNo.toLowerCase(), list(data.needs), list(data.settings), data.volume, data.timeline][i]; });
    done.hidden = false; done.focus({ preventScroll: true });
    if (!reduced) {
      done.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 600, easing: "cubic-bezier(.2,.7,.1,1)" });
      root.querySelector("[data-stamp]").animate([{ transform: "rotate(-8deg) scale(2.2)", opacity: 0 }, { transform: "rotate(-8deg) scale(.96)", opacity: 1, offset: .7 }, { transform: "rotate(-8deg) scale(1)", opacity: 1 }],
        { duration: 520, delay: 380, easing: "cubic-bezier(.5,0,.75,0)", fill: "backwards" });
    }
  });

  // the floating button shows once the hero's own buttons are behind you
  const showFab = () => fab.classList.toggle("show", scrollY > (document.body.classList.contains("home") ? innerHeight * .7 : 160) && scrollY + innerHeight < document.documentElement.scrollHeight - 140);
  addEventListener("scroll", showFab, { passive: true }); showFab();
})();
