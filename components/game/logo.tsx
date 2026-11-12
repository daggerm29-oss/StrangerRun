export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const big = size === 'lg'
  return (
    <div className="flex flex-col items-center select-none" aria-label="Stranger Run">
      <div aria-hidden="true" className="flex flex-col items-center">
        <div className={`h-[2px] bg-blood st-glow ${big ? 'w-64' : 'w-44'}`} style={{ boxShadow: '0 0 10px #e50914' }} />
        <h1
          className={`st-title font-serif font-bold leading-none tracking-tight ${big ? 'text-[2.6rem]' : 'text-3xl'} flex items-end`}
        >
          <span className={big ? 'text-[3.4rem]' : 'text-4xl'}>S</span>
          TRANGE
          <span className={big ? 'text-[3.4rem]' : 'text-4xl'}>R</span>
        </h1>
        <div className="flex w-full items-center gap-2">
          <div className="h-[2px] flex-1 bg-blood" style={{ boxShadow: '0 0 10px #e50914' }} />
          <span className={`st-title font-serif font-bold leading-none ${big ? 'text-3xl' : 'text-xl'}`}>RUN</span>
          <div className="h-[2px] flex-1 bg-blood" style={{ boxShadow: '0 0 10px #e50914' }} />
        </div>
      </div>
    </div>
  )
}
