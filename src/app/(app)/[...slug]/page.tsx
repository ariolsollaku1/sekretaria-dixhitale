import { notFound } from "next/navigation";

// Unknown URLs render the 404 inside the shell for signed-in users.
export default function CatchAll() {
  notFound();
}
