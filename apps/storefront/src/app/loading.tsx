export default function Loading() {
  return (
    <div className="min-h-[55vh] bg-carbon px-4 pb-16 pt-32 md:px-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-4 w-32 rounded-full bg-brick/15" />
        <div className="mt-5 h-12 w-3/4 max-w-xl rounded-full bg-brick/10" />
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-7">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index}>
              <div className="aspect-[3/4] rounded-lg bg-carbon-soft" />
              <div className="mt-4 h-3 w-2/3 rounded bg-brick/10" />
              <div className="mt-2 h-3 w-1/2 rounded bg-brick/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
