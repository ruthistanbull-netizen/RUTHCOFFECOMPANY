import { redirect } from "next/navigation";

export default function ReturnShippingRedirect() {
  redirect("/returns");
}
