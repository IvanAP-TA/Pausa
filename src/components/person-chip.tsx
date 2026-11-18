import { Check } from "lucide-react";
import { Avatar } from "./avatar";

type Props = {
  /** The form field this chip belongs to; chips sharing a `name` are one group. */
  name: string;
  value: string;
  /** "checkbox": any number of people. "radio": one of the group. */
  type?: "checkbox" | "radio";
  defaultChecked?: boolean;
  /** The person shown: portrait and name. Leave out for a choice that is not a person ("everyone"). */
  user?: { id: string; name: string; image?: string | null };
  children?: React.ReactNode;
};

/**
 * A person to pick: their portrait and their name on a 44px chip. The native input is kept (so the form, the keyboard and
 * screen readers work as usual) but drawn by the chip: chosen is a filled chip with a tick, never colour alone.
 */
export function PersonChip({ name, value, type = "checkbox", defaultChecked = false, user, children }: Props) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer select-none items-center gap-2 border border-rule py-1 pl-1.5 pr-3 text-ink-2 transition-colors duration-150 hover:border-muted has-[:checked]:border-ink has-[:checked]:bg-paper-3 has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      {user ? <Avatar user={user} size={28} /> : <span aria-hidden="true" className="w-1" />}
      <span className="max-w-[12rem] truncate">{user ? user.name : children}</span>
      <Check size={16} strokeWidth={2} aria-hidden="true" className="hidden shrink-0 text-accent peer-checked:block" />
    </label>
  );
}
