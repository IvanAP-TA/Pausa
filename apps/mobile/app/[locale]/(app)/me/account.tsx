import { privateMetadata } from "@/seo/metadata";
import { Account } from "@/features/Account";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Account />;
}
