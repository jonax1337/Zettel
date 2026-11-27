/**
 * One floating tooltip for every mark of every chart. It follows the pointer and
 * opens on keyboard focus too, so a mark reached by Tab shows the same text.
 */
let element: HTMLDivElement | null = null;

const POINTER_OFFSET = 14;
const VIEWPORT_MARGIN = 8;

function tooltipElement(): HTMLDivElement {
  if (element) return element;
  element = document.createElement("div");
  element.setAttribute("role", "tooltip");
  Object.assign(element.style, {
    position: "fixed",
    zIndex: "60",
    display: "none",
    pointerEvents: "none",
    whiteSpace: "pre-line",
    maxWidth: "280px",
    padding: "7px 10px",
    borderRadius: "8px",
    border: "1px solid var(--line-strong)",
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    fontSize: "12.5px",
    lineHeight: "1.5",
    boxShadow: "0 8px 24px -8px rgb(0 0 0 / 40%)",
  });
  document.body.appendChild(element);
  return element;
}

function show(text: string, x: number, y: number): void {
  const tip = tooltipElement();
  tip.textContent = text;
  tip.style.display = "block";
  const { width, height } = tip.getBoundingClientRect();
  const left = Math.min(x + POINTER_OFFSET, window.innerWidth - width - VIEWPORT_MARGIN);
  const top = y + POINTER_OFFSET + height > window.innerHeight ? y - height - POINTER_OFFSET : y + POINTER_OFFSET;
  tip.style.left = `${Math.max(VIEWPORT_MARGIN, left)}px`;
  tip.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
}

function hide(): void {
  if (element) element.style.display = "none";
}

/** Svelte action: `use:tooltip={"Mai 2026\nEinnahmen 3.350,00 €"}`. */
export function tooltip(node: Element, initialText: string) {
  let text = initialText;
  const showAtPointer = (event: Event) => {
    const { clientX, clientY } = event as MouseEvent;
    show(text, clientX, clientY);
  };
  const showAtNode = () => {
    const box = node.getBoundingClientRect();
    show(text, box.left + box.width / 2, box.top);
  };
  const onKeydown = (event: Event) => {
    if ((event as KeyboardEvent).key === "Escape") hide();
  };

  node.addEventListener("mouseenter", showAtPointer);
  node.addEventListener("mousemove", showAtPointer);
  node.addEventListener("mouseleave", hide);
  node.addEventListener("focus", showAtNode);
  node.addEventListener("blur", hide);
  node.addEventListener("keydown", onKeydown);

  return {
    update(newText: string) {
      text = newText;
    },
    destroy() {
      hide();
      node.removeEventListener("mouseenter", showAtPointer);
      node.removeEventListener("mousemove", showAtPointer);
      node.removeEventListener("mouseleave", hide);
      node.removeEventListener("focus", showAtNode);
      node.removeEventListener("blur", hide);
      node.removeEventListener("keydown", onKeydown);
    },
  };
}
