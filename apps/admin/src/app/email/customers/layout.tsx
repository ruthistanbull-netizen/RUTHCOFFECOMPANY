import type { ReactNode } from "react";
import { ExactEmailCustomers } from "@/components/base44-exact/ExactEmailCustomers";
import styles from "./mobile.module.css";

export default function EmailCustomersLayout({ children: _children }: { children: ReactNode }) {
  return <div className={styles.root}><ExactEmailCustomers /></div>;
}
