import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initAnimations(): void {
  if (reduced()) {
    gsap.set("[data-reveal], [data-hero-word], [data-line-rise]", {
      clearProps: "all",
      opacity: 1,
      y: 0,
      rotate: 0,
    });
    gsap.set("[data-reveal-mask]", { clipPath: "inset(0 0 0% 0)" });
    return;
  }

  scrollProgress();
  heroTimeline();
  lineRise();
  revealOnScroll();
  maskReveal();
  underlineDraw();
  heroBentoStagger();
  marqueeLoop();
  bentoStagger();
  screenshotsParallax();
  chartDraw();
  statsCountUp();
  pinnedStepper();
  ctaWipe();
  tiltMockup();

  // Recalculate once images/fonts settle
  window.addEventListener("load", () => ScrollTrigger.refresh());
}

/** Thin reading-progress bar pinned to the top. */
function scrollProgress(): void {
  const bar = document.querySelector<HTMLElement>("[data-scroll-progress]");
  if (!bar) return;
  gsap.to(bar, {
    scaleX: 1,
    ease: "none",
    scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
  });
}

/** 1. Hero: word-by-word headline, sub copy, CTAs, mockup float-in. */
function heroTimeline(): void {
  const words = gsap.utils.toArray<HTMLElement>("[data-hero-word]");
  if (!words.length) return;

  const tl = gsap.timeline({ defaults: { ease: "power3.out" }, delay: 0.1 });
  tl.to(words, {
    opacity: 1,
    y: 0,
    rotate: 0,
    duration: 1,
    stagger: 0.06,
  })
    .from("[data-hero-eyebrow]", { opacity: 0, y: 14, duration: 0.6 }, 0.15)
    .from("[data-hero-sub]", { opacity: 0, y: 22, duration: 0.7 }, "-=0.6")
    .from("[data-hero-cta]", { opacity: 0, y: 18, scale: 0.96, duration: 0.6, stagger: 0.1 }, "-=0.45")
    .from("[data-hero-mockup]", { opacity: 0, y: 60, rotateX: 12, duration: 1.1 }, "-=0.7")
    .from("[data-hero-orb]", { opacity: 0, scale: 0.6, duration: 1.4 }, "-=1.1");

  // Draw the hero sparkline
  const path = document.querySelector<SVGPathElement>("[data-hero-line]");
  if (path) {
    const len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(path, { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut" }, "-=0.8");
  }
}

/** Editorial line-rise reveals (masked lines sliding up). */
function lineRise(): void {
  gsap.utils.toArray<HTMLElement>("[data-line-rise]").forEach((el, i) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: "power4.out",
      delay: i * 0.05,
      scrollTrigger: { trigger: el, start: "top 92%" },
    });
  });
}

/** Bento hero tiles rise in behind the headline timeline. */
function heroBentoStagger(): void {
  const grid = document.querySelector("[data-hero-bento]");
  if (!grid) return;
  gsap.set(grid.children, { opacity: 0, y: 40 });
  gsap.to(grid.children, {
    opacity: 1,
    y: 0,
    duration: 0.9,
    ease: "power3.out",
    stagger: 0.1,
    delay: 0.55,
  });
}

/** Clip-path wipe reveals for images / panels. */
function maskReveal(): void {
  gsap.utils.toArray<HTMLElement>("[data-reveal-mask]").forEach((el) => {
    gsap.to(el, {
      clipPath: "inset(0 0 0% 0)",
      duration: 1.1,
      ease: "power4.inOut",
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });
}

/** Amber marker underline that draws under an accent word. */
function underlineDraw(): void {
  gsap.utils.toArray<HTMLElement>("[data-underline]").forEach((el) => {
    gsap.to(el, {
      duration: 0.01,
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        onEnter: () => el.classList.add("is-active"),
      },
    });
  });
}

/** Generic scroll reveal for [data-reveal]. */
function revealOnScroll(): void {
  gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.85,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });
}

/** 2. Infinite marquee (trust strip) — seamless GSAP loop. */
function marqueeLoop(): void {
  const track = document.querySelector<HTMLElement>("[data-marquee-track]");
  if (!track) return;
  const inner = track.querySelector<HTMLElement>("[data-marquee-inner]");
  if (!inner) return;

  const half = inner.scrollWidth / 2;
  gsap.to(inner, {
    x: -half,
    duration: 28,
    ease: "none",
    repeat: -1,
    modifiers: { x: gsap.utils.unitize((x) => parseFloat(x) % -half) },
  });
}

/** 3. Bento feature cards staggered entrance. */
function bentoStagger(): void {
  const grid = document.querySelector("[data-bento]");
  if (!grid) return;
  gsap.from(grid.children, {
    opacity: 0,
    y: 44,
    duration: 0.8,
    ease: "power3.out",
    stagger: 0.09,
    scrollTrigger: { trigger: grid, start: "top 82%" },
  });
}

/** 4. Showcase screenshots: per-card parallax + scale-in. */
function screenshotsParallax(): void {
  gsap.utils.toArray<HTMLElement>("[data-shot]").forEach((shot, i) => {
    gsap.from(shot, {
      opacity: 0,
      y: 70,
      scale: 0.96,
      duration: 1,
      ease: "power3.out",
      scrollTrigger: { trigger: shot, start: "top 90%" },
    });
    gsap.to(shot, {
      yPercent: i % 2 === 0 ? -6 : 6,
      ease: "none",
      scrollTrigger: {
        trigger: shot,
        start: "top bottom",
        end: "bottom top",
        scrub: 1.2,
      },
    });
  });
}

/** 5. Predictions chart: actual vs predicted path draws + dots pop. */
function chartDraw(): void {
  const svg = document.querySelector("[data-chart]");
  if (!svg) return;
  const paths = svg.querySelectorAll<SVGPathElement>("[data-chart-line]");
  const dots = svg.querySelectorAll<SVGCircleElement>("[data-chart-dot]");

  const tl = gsap.timeline({
    scrollTrigger: { trigger: svg, start: "top 78%" },
  });

  paths.forEach((path) => {
    const len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(path, { strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut" }, 0);
  });
  tl.from(
    dots,
    { scale: 0, transformOrigin: "center", duration: 0.5, ease: "back.out(2.5)", stagger: 0.1 },
    0.7,
  );
}

/** 6. Stats band: snap count-up on enter. */
function statsCountUp(): void {
  gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count ?? 0);
    const suffix = el.dataset.suffix ?? "";
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.8,
      ease: "power2.out",
      snap: { v: 1 },
      scrollTrigger: { trigger: el, start: "top 88%" },
      onUpdate: () => {
        el.textContent = `${Math.round(obj.v).toLocaleString("en-IN")}${suffix}`;
      },
    });
  });
}

/** 7. How it works: pinned, scroll-scrubbed stepper 01→02→03. */
function pinnedStepper(): void {
  const section = document.querySelector<HTMLElement>("[data-stepper]");
  if (!section) return;
  const steps = gsap.utils.toArray<HTMLElement>("[data-step]");
  const progress = section.querySelector<HTMLElement>("[data-step-progress]");
  if (steps.length < 3) return;

  const isDesktop = window.matchMedia("(min-width: 900px)").matches;
  if (!isDesktop) {
    // Mobile: simple stagger instead of pin
    gsap.from(steps, {
      opacity: 0,
      y: 40,
      duration: 0.7,
      stagger: 0.15,
      ease: "power3.out",
      scrollTrigger: { trigger: section, start: "top 75%" },
    });
    gsap.set(progress ?? section, { scaleX: 1 });
    return;
  }

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: "+=2200",
      pin: true,
      scrub: 0.8,
    },
  });

  steps.forEach((step, i) => {
    const active = step;
    const others = steps.filter((_, j) => j !== i);
    tl.to(active, { opacity: 1, scale: 1, duration: 1 }, i)
      .to(others, { opacity: 0.28, scale: 0.97, duration: 1, stagger: 0 }, i)
      .to(
        progress ?? {},
        { scaleX: (i + 1) / steps.length, duration: 1, ease: "none" },
        i,
      );
  });
}

/** 8. Final CTA: green panel wipes up + headline rises. */
function ctaWipe(): void {
  const panel = document.querySelector<HTMLElement>("[data-cta-panel]");
  if (!panel) return;
  gsap.from(panel, {
    clipPath: "inset(100% 0% 0% 0% round 32px)",
    duration: 1.2,
    ease: "power4.inOut",
    scrollTrigger: { trigger: panel, start: "top 82%" },
  });
  gsap.from(panel.querySelectorAll("[data-cta-rise]"), {
    opacity: 0,
    y: 36,
    duration: 0.9,
    stagger: 0.12,
    ease: "power3.out",
    scrollTrigger: { trigger: panel, start: "top 72%" },
    delay: 0.3,
  });
}

/** Hero mockup: mouse-tracked 3D tilt. */
function tiltMockup(): void {
  const mockup = document.querySelector<HTMLElement>("[data-hero-mockup]");
  const hero = document.querySelector<HTMLElement>("[data-hero-zone]");
  if (!mockup || !hero) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;

  const rx = gsap.quickTo(mockup, "rotationX", { duration: 0.6, ease: "power3.out" });
  const ry = gsap.quickTo(mockup, "rotationY", { duration: 0.6, ease: "power3.out" });

  hero.addEventListener("mousemove", (e) => {
    const rect = hero.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rx(-py * 10);
    ry(px * 12);
  });
  hero.addEventListener("mouseleave", () => {
    rx(0);
    ry(0);
  });
}
