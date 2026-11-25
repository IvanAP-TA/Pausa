import { privateMetadata } from "@/seo/metadata";
import { CircleSettings } from "@/features/CircleSettings";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <CircleSettings />;
}
