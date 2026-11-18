"use client";

import { useFormStatus } from "react-dom";

/** A submit button that says the form is being sent: disabled and marked busy until the action answers. */
export function SubmitButton({ children, pending, className = "btn" }: { children: React.ReactNode; pending?: React.ReactNode; className?: string }) {
  const status = useFormStatus();
  return (
    <button disabled={status.pending} aria-busy={status.pending || undefined} className={`${className} disabled:opacity-60`}>
      {status.pending && pending ? pending : children}
    </button>
  );
}
