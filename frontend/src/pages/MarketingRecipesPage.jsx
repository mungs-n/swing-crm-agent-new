import { CATEGORIES, RECIPES, CHANNEL_LABEL } from "../data/marketingRecipes";
import RecipeArt from "../components/RecipeArt";

function RecipeCard({ r, onSelectRecipe }) {
  return (
    <button
      onClick={() => onSelectRecipe(r)}
      className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm shadow-slate-200/40 transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-100/50"
    >
      <div
        className="flex h-20 items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${r.colors[0]}, ${r.colors[1]}40)`, color: r.colors[1] }}
      >
        <RecipeArt art={r.art} size={34} />
      </div>
      <div className="p-3">
        {r.isNew && (
          <div className="mb-1.5">
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-600">NEW</span>
          </div>
        )}
        <p className="text-[12px] font-bold leading-snug text-slate-800">{r.title}</p>
        <p className="mt-1 text-[10px] text-slate-400">{r.situation}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">{r.segment}</span>
          <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">{CHANNEL_LABEL[r.channel]}</span>
        </div>
        <p className="mt-2 text-[9px] font-medium text-violet-500 opacity-0 transition group-hover:opacity-100">이 레시피로 캠페인 만들기 →</p>
      </div>
    </button>
  );
}

export default function MarketingRecipesPage({ onBack, onSelectRecipe }) {
  return (
    <div>
      <button onClick={onBack} className="mb-3 w-fit text-[11px] font-medium text-slate-400 hover:text-violet-600">
        ← 캠페인 관리로 돌아가기
      </button>

      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-900">마케팅 레시피</h2>
        <p className="mt-1 text-[11px] text-slate-400">
          상황·세그먼트별로 미리 정해둔 템플릿이에요. 카드를 선택하면 해당 세그먼트·채널로 캠페인 작성 화면이 열리고, 템플릿 문구가 바로 채워져요. 다른 느낌으로 바꾸고 싶으면 AI로 다시 생성할 수 있어요.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {CATEGORIES.map((cat) => {
          const items = RECIPES.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[11px] font-bold text-slate-700">{cat}</h3>
                <span className="text-[9px] text-slate-300">{items.length}개</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((r) => (
                  <RecipeCard key={r.id} r={r} onSelectRecipe={onSelectRecipe} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
