import { RECIPES, CHANNEL_LABEL } from "../data/marketingRecipes";
import RecipeArt from "./RecipeArt";

const COLLAPSED_COUNT = 3;

export default function MarketingRecipes({ campaigns, onSelectRecipe, onOpenAll }) {
  const visible = RECIPES.slice(0, COLLAPSED_COUNT);

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-200/40">
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-semibold text-slate-800">마케팅 레시피</h3>
          <p className="mt-0.5 text-[9px] text-slate-400">상황·세그먼트에 맞는 템플릿을 고르면 바로 채워져요. 다른 느낌은 AI로 다시 생성할 수 있어요.</p>
        </div>
        <button onClick={onOpenAll} className="shrink-0 text-[10px] font-medium text-violet-600 hover:underline">
          더보기 ({RECIPES.length - COLLAPSED_COUNT}) →
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const used = campaigns.some((c) => c.segment === r.segment);
          return (
            <button
              key={r.id}
              onClick={() => onSelectRecipe(r)}
              className="group overflow-hidden rounded-lg border border-slate-200 text-left transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-100/50"
            >
              <div
                className="flex h-14 items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${r.colors[0]}, ${r.colors[1]}40)`, color: r.colors[1] }}
              >
                <RecipeArt art={r.art} size={26} />
              </div>
              <div className="p-2.5">
                <div className="mb-1 flex gap-1">
                  {r.isNew && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-600">NEW</span>}
                  <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-medium ${used ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-600"}`}>
                    {used ? "사용해봄" : "미사용"}
                  </span>
                </div>
                <p className="text-[11px] font-bold leading-snug text-slate-800">{r.title}</p>
                <p className="mt-0.5 text-[9px] text-slate-400">{r.situation}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">{r.segment}</span>
                  <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">{CHANNEL_LABEL[r.channel]}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
