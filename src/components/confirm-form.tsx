"use client";

import { useId, useRef } from "react";
import { SubmitButton } from "./submit-button";

/**
 * A button that asks before it acts: it opens a modal that says what is about to happen, and only the modal's own button
 * sends the form. For things that undo a lot at once. Escape, the backdrop's Cancel and the browser's back all close it.
 */
export function ConfirmForm({ action, fields, trigger, triggerLabel, triggerClassName = "btn btn-sm", title, body, confirm, cancel, pending }: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  trigger: React.ReactNode;
  /** The accessible name, when the trigger is only an icon. */
  triggerLabel?: string;
  triggerClassName?: string;
  title: string;
  body: React.ReactNode;
  confirm: string;
  cancel: string;
  pending?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  return (
    <>
      <button type="button" aria-label={triggerLabel} className={triggerClassName} onClick={() => dialog.current?.showModal()}>{trigger}</button>
      <dialog ref={dialog} aria-labelledby={heading}
        className="fixed inset-0 m-auto h-fit w-[min(92vw,30rem)] border border-rule bg-paper p-0 text-left text-ink backdrop:bg-scrim">
        <div className="grid gap-4 p-6">
          <h2 id={heading} className="title">{title}</h2>
          <div className="grid gap-2 text-ink-2">{body}</div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>{cancel}</button>
            <form action={action}>
              {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
              <SubmitButton className="btn border-error text-error hover:border-error" pending={pending}>{confirm}</SubmitButton>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
