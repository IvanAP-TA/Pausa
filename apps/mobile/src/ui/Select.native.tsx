import { Choice, type ChoiceOption } from "./Choice";

/** Native: no select element; the same options as a row of radio buttons (see Select.tsx). */
export function Select<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Array<ChoiceOption<V>>; onChange: (v: V) => void; testID?: string }) {
  return <Choice label={label} value={value} options={options} onChange={onChange} />;
}
