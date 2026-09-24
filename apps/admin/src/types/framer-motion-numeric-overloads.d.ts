import "framer-motion";

declare module "framer-motion" {
  /**
   * Framer Motion's numeric MotionValue overloads are invariant in the
   * MotionValue generic. Narrow numeric values such as MotionValue<0 | 1>
   * and derived numeric springs are still valid at runtime, but TypeScript
   * can otherwise infer callback values as a wider non-arithmetic type.
   * Keep runtime behavior unchanged and widen only numeric transforms.
   */
  function useTransform<T extends number>(
    value: MotionValue<T>,
    inputRange: number[],
    outputRange: number[],
    options?: TransformOptions<number>,
  ): MotionValue<number>;

  function useTransform<T extends number, O>(
    value: MotionValue<T>,
    transformer: (latest: number) => O,
  ): MotionValue<O>;
}
