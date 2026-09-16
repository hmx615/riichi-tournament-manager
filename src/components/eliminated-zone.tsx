"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function EliminatedZone({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return <>
    <tr className="eliminated-line"><td colSpan={7}>
      <div className="eliminated-line-head">
        <span>淘汰区</span>
        <button type="button" className="eliminated-line-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <><ChevronUp size={13} />收起已淘汰选手</> : <><ChevronDown size={13} />展开已淘汰选手</>}
        </button>
      </div>
    </td></tr>
    {open && children}
  </>;
}
