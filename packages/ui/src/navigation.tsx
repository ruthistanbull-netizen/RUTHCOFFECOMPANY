import * as React from "react";
import type { ButtonSize, ButtonVariant } from "./primitives";

export interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
}

export const ButtonLink = React.forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  ({ variant = "primary", size = "md", disabled = false, className = "", children, onClick, tabIndex, href, ...props }, ref) => {
    const handleClick = onClick
      ? (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick(event);
        }
      : undefined;

    return (
      <a
        ref={ref}
        className={`ruth-button ruth-button--${variant} ruth-button--${size} ${className}`.trim()}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : tabIndex}
        href={disabled ? undefined : href}
        onClick={handleClick}
        {...props}
      >
        <span>{children}</span>
      </a>
    );
  }
);

ButtonLink.displayName = "ButtonLink";
