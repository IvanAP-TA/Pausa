import { privateMetadata } from "@/seo/metadata";
import { Me } from "@/features/people/Me";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Me />;
}
