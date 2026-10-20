import { animate, hover, inView, stagger } from "motion";

export const SPRING = { type: "spring", stiffness: 400, damping: 25 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 220, damping: 26 } as const;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Motion micro-interactions: springy buttons, hovers, toggles. */
export function initMotion(): void {
  if (reduced()) return;

  document.querySelectorAll<HTMLElement>('[data-motion="scale"]').forEach((el) => {
    hover(el, () => {
      animate(el, { scale: 1.04 }, { ...SPRING, duration: 0.01 });
    });
    el.addEventListener("mouseleave", () =>
      animate(el, { scale: 1 }, { ...SPRING, duration: 0.01 }),
    );
  });

  document.querySelectorAll<HTMLElement>('[data-motion="lift"]').forEach((el) => {
    hover(el, () => {
      animate(el, { y: -6 }, { ...SPRING_SOFT, duration: 0.01 });
    });
    el.addEventListener("mouseleave", () =>
      animate(el, { y: 0 }, { ...SPRING_SOFT, duration: 0.01 }),
    );
  });

  // Nav / marquee chips: soft pop when they scroll into view
  document.querySelectorAll<HTMLElement>('[data-motion="pop"]').forEach((el) => {
    inView(
      el,
      () => {
        animate(
          el,
          { opacity: [0, 1], scale: [0.94, 1] },
          { duration: 0.5, ease: EASE_OUT, delay: 0.05 },
        );
      },
      { margin: "-10% 0px" },
    );
  });

  // Pulsing notify CTA (pricing teaser)
  document.querySelectorAll<HTMLElement>('[data-motion="pulse"]').forEach((el) => {
    animate(
      el,
      { boxShadow: [
        "0 0 0 0px rgba(245,158,11,0.45)",
        "0 0 0 14px rgba(245,158,11,0)",
      ] },
      { duration: 1.8, repeat: Infinity, ease: "easeOut" },
    );
  });

  // FAQ-style accordions (details/summary) — height spring
  document.querySelectorAll<HTMLDetailsElement>("details[data-motion-accordion]").forEach((d) => {
    const content = d.querySelector<HTMLElement>(".accordion-body");
    if (!content) return;
    content.style.overflow = "hidden";
    d.addEventListener("toggle", () => {
      if (d.open) {
        animate(content, { height: "auto", opacity: 1 }, { duration: 0.4, ease: EASE_OUT });
      } else {
        animate(content, { height: 0, opacity: 0 }, { duration: 0.3, ease: EASE_OUT });
      }
    });
  });

  // Stagger helper for grouped children entering together
  document.querySelectorAll<HTMLElement>("[data-stagger-group]").forEach((group) => {
    const kids = Array.from(group.children) as HTMLElement[];
    kids.forEach((k) => (k.style.opacity = "0"));
    inView(
      group,
      () => {
        animate(
          kids,
          { opacity: [0, 1], y: [24, 0] },
          { delay: stagger(0.08), duration: 0.6, ease: EASE_OUT },
        );
      },
      { margin: "-12% 0px" },
    );
  });
}
