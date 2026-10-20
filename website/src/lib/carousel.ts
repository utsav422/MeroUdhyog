import emblaCarousel from "embla-carousel";
import EmblaAutoplay from "embla-carousel-autoplay";

type Direction = "prev" | "next";

function setupCarousel(name: string, options: { autoplay?: boolean } = {}): void {
  const viewport = document.querySelector<HTMLElement>(`[data-embla="${name}"]`);
  if (!viewport) return;
  const slides = viewport.querySelectorAll("[data-embla-slide]");
  if (!slides.length) return;

  const autoplay = options.autoplay
    ? EmblaAutoplay({ delay: 4500, stopOnInteraction: false, stopOnMouseEnter: true })
    : undefined;

  const embla = emblaCarousel(viewport, {
    loop: true,
    align: "start",
    dragFree: false,
    ...(autoplay ? { plugins: [autoplay] } : {}),
  });

  const dotsWrap = document.querySelector<HTMLElement>(`[data-embla-dots="${name}"]`);
  const dots: HTMLButtonElement[] = [];

  if (dotsWrap) {
    slides.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
      dot.className =
        "h-1.5 rounded-full transition-all duration-400 ease-brand";
      dot.style.width = "1.25rem";
      dot.style.background = "rgba(255,255,255,0.25)";
      dot.addEventListener("click", () => embla.scrollTo(i));
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });
  }

  const sync = () => {
    const idx = embla.selectedScrollSnap();
    dots.forEach((d, i) => {
      const active = i === idx;
      d.style.width = active ? "2.25rem" : "1.25rem";
      d.style.background = active ? "#ffbf4d" : "rgba(255,255,255,0.25)";
    });
  };

  embla.on("select", sync);
  embla.on("reInit", sync);
  sync();

  const nav = (dir: Direction) => () => (dir === "next" ? embla.scrollNext() : embla.scrollPrev());
  document.querySelectorAll<HTMLElement>(`[data-embla-next="${name}"]`).forEach((btn) => {
    btn.addEventListener("click", nav("next"));
  });
  document.querySelectorAll<HTMLElement>(`[data-embla-prev="${name}"]`).forEach((btn) => {
    btn.addEventListener("click", nav("prev"));
  });
}

export function initCarousels(): void {
  setupCarousel("screens", { autoplay: true });
  setupCarousel("life", { autoplay: true });
}
