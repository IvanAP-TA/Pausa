import { privateMetadata } from "@/seo/metadata";
import { SignIn } from "@/features/SignIn";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <SignIn />;
}
