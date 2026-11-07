import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/** Neon-style section with a sticky side index that follows the scroll position. */
export function DeepDive({ items }: { items: { id: string; label: string; node: React.ReactNode }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    Object.values(refs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [items.length]);
  return (
    <section className="deepdive no-print">
      <div className="container dd-grid">
        <nav className="dd-nav" aria-label="How it works">
          {items.map((it) => (
            <a key={it.id} href={`#${it.id}`} className={active === it.id ? "active" : ""}>
              {active === it.id && <motion.span layoutId="dd-dot" className="dd-dot" />}
              {it.label}
            </a>
          ))}
        </nav>
        <div className="dd-body">
          {items.map((it) => (
            <div key={it.id} id={it.id} ref={(el) => { refs.current[it.id] = el; }} className="dd-item">{it.node}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
