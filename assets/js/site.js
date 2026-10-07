// Entrance, scroll reveals, and nothing else.
(() => {
  const go = () => document.body.classList.add("ready");
  if (document.hidden) document.addEventListener("visibilitychange", function once() { if (!document.hidden) { document.removeEventListener("visibilitychange", once); go(); } });
  else requestAnimationFrame(go);
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
})();
