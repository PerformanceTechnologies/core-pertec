"use client";

import { useEffect, useState } from "react";
import { IconArrowUp } from "@tabler/icons-react";

export default function BotonSubir() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-naranjo text-white shadow-lg transition hover:bg-naranjo-suave lg:hidden"
    >
      <IconArrowUp size={20} stroke={2} />
    </button>
  );
}
