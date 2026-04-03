"""
Kalıcı kural listesi: taslak (draft) ve yayınlanmış (published) snapshot.
LLM yalnızca yayınlanmış kuralları kullanır.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field

from config import BACKEND_ROOT

logger = logging.getLogger(__name__)

_DATA_DIR = BACKEND_ROOT / "data"
_RULES_FILE = _DATA_DIR / "review_rules.json"
_lock = threading.Lock()


class RuleLine(BaseModel):
    id: str = Field(..., min_length=1, max_length=80)
    text: str = Field(default="", max_length=8000)
    requires_metadata: bool = Field(
        default=False,
        description="Veritabanı nesne incelemesinde bağımlılık + sys.columns özeti LLM isteğine eklenir.",
    )


class RuleBundle(BaseModel):
    critical: list[RuleLine] = Field(default_factory=list)
    normal: list[RuleLine] = Field(default_factory=list)


class RulesState(BaseModel):
    draft: RuleBundle
    published: RuleBundle
    published_at: str | None = None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


_RULE_ID_NUM = re.compile(r"^(?:Rule|Kural)(\d+)$", re.IGNORECASE)


def _format_rule_num(n: int) -> str:
    """Kural01 … Kural99, sonra Kural100 … (eski RuleNN kimlikleri de tanınır)."""
    if n < 100:
        return f"Kural{n:02d}"
    return f"Kural{n}"


def _next_rule_id(used: set[str]) -> str:
    """used kümesine eklenmemiş bir sonraki KuralNN (mevcut Rule/Kural numaralarının üstü)."""
    max_n = 0
    for rid in used:
        m = _RULE_ID_NUM.match(rid.strip())
        if m:
            max_n = max(max_n, int(m.group(1)))
    n = max_n + 1
    while True:
        cand = _format_rule_num(n)
        if cand not in used:
            used.add(cand)
            return cand
        n += 1


def _default_bundle() -> RuleBundle:
    """İlk kurulum ve dosya yokken kullanılan EDW/DM inceleme kuralları (kritik + önemli)."""
    return RuleBundle(
        critical=[
            RuleLine(
                id="Kural01",
                text=(
                    "Partition kullanımı: Hangi partition silme scriptinin kullanıldığı, doğru biçimde "
                    "ve standart silme yapımına uygun kullanılıp kullanılmadığı (partition temizleme "
                    "süreçleri dahil) kontrol edilmeli."
                ),
            ),
            RuleLine(
                id="Kural02",
                text=(
                    "SCD tablolarda EdwValidFrom ve EdwValidUntil alanlarının kullanımı; zaman "
                    "çizelgesi ve geçerlilik mantığı tutarlı mı (çok kritik)."
                ),
            ),
            RuleLine(
                id="Kural03",
                text=(
                    "DM katmanında üretilen asıl viewlarda son kullanıcıya sunulan kolonlar arasında "
                    "veri ambarına özgü ham ID değerleri olmamalı; NK değerleri ID isimlendirmesiyle "
                    "sunulmalıdır."
                ),
            ),
            RuleLine(
                id="Kural04",
                text=(
                    "NK alanları üzerinde sıralama, ortalama alma vb. işlemlerde sayısal bir veri "
                    "tipine dönüşümün sağlanmış olduğu kontrol edilmeli."
                ),
            ),
            RuleLine(
                id="Kural05",
                text=(
                    "Fiziksel tabloların SELECT edildiği yerlerde WITH (NOLOCK) kullanımı olmalı "
                    "(eksik veya yanlış kullanım işaretlenmeli)."
                ),
            ),
        ],
        normal=[
            RuleLine(
                id="Kural06",
                text=(
                    "Kullanılan tarih parametresinin veri tipi ile ilişkilendirildiği alanların "
                    "veri tipi uyumu (implicit dönüşüm / yanlış karşılaştırma)."
                ),
            ),
            RuleLine(
                id="Kural07",
                text=(
                    "LEFT ve INNER join birlikte kullanıldığında sıralama: INNER, LEFT’ten sonra "
                    "gelmemeli (join sırası standartlara uygun olmalı)."
                ),
            ),
            RuleLine(
                id="Kural08",
                text="Gereksiz DISTINCT kullanımı tespit edilmeli.",
            ),
            RuleLine(
                id="Kural09",
                text="SELECT … FROM arasında (SELECT listesi içinde) SUBSELECT kullanımı kontrol edilmeli.",
            ),
            RuleLine(
                id="Kural10",
                text=(
                    "MAXDOP, HASH JOIN, özel index ipuçları vb. standart dışı kullanımlar "
                    "gerekçelendirilmedikse işaretlenmeli."
                ),
            ),
            RuleLine(
                id="Kural11",
                text=(
                    "Fiziksel tablolara INSERT yapılan yerlerde WITH (TABLOCK) kullanımı "
                    "(standart gereksinim)."
                ),
            ),
            RuleLine(
                id="Kural12",
                text=(
                    "Temp tablolara SELECT veya INSERT yapılan yerlerde NOLOCK veya TABLOCK "
                    "kullanılmamalı (kullanılıyorsa işaretlenmeli)."
                ),
            ),
            RuleLine(
                id="Kural13",
                text=(
                    "Hazırlanan final veri setinin önce temp tabloya INSERT edilip sonra asıl hedef "
                    "tabloya tekrar INSERT edilmesi (çift insert) durumları kontrol edilmeli."
                ),
            ),
            RuleLine(
                id="Kural14",
                text=(
                    "Joinlenen alanların veri tipi uyumu (ör. int ile varchar join); farklılıklar "
                    "tespit edilmeli."
                ),
            ),
            RuleLine(
                id="Kural15",
                text=(
                    "IS NULL kullanımları; birçok yerde -99 ile çözümleme beklentisi varsa buna "
                    "özellikle bakılmalı."
                ),
            ),
            RuleLine(
                id="Kural16",
                text=(
                    "Özel filtreleme işlemlerinin NK alanlarından yapılıyor olması; Id alanlarından "
                    "filtre yapılmamalı (Id üzerinden filtre varsa işaretlenmeli)."
                ),
            ),
            RuleLine(
                id="Kural17",
                text=(
                    "EDWDM prosedürlerinde EdwEtlDate, PersonnelFlag gibi alanların INSERT ile "
                    "doldurulmaması; constraint / varsayılan ile dolması beklenir (manuel insert varsa işaretle)."
                ),
            ),
            RuleLine(
                id="Kural18",
                text=(
                    "PersonnelFlag kullanımına dair standart kontroller (özellikle türev viewlarda ve "
                    "ana kaynağı bir DM tablosu olan ana viewlarda)."
                ),
            ),
            RuleLine(
                id="Kural19",
                text=(
                    "PersonnelFlag detayı için kullanılan lkp tabloları: Müşteri detayı içeren DM "
                    "tablosunu okuyan bir viewda bu lkp tabloları kullanılmamalı (kullanım varsa işaretle)."
                ),
            ),
            RuleLine(
                id="Kural20",
                text="COUNT(*) yerine COUNT(1) kullanımı tercih edilmeli.",
            ),
            RuleLine(
                id="Kural21",
                text=(
                    "UNION ile UNION ALL seçimi; gereksiz duplicate giderme için UNION kullanımı "
                    "yapılmamalı (gereksiz UNION işaretlenmeli)."
                ),
            ),
            RuleLine(
                id="Kural22",
                text=(
                    "İndeks kullanımını önleyen conversion işlemleri; joinlenen kolonlarda conversion "
                    "varsa not edilmeli (detaya girmeden)."
                ),
            ),
            RuleLine(
                id="Kural23",
                text=(
                    "ROW_NUMBER kullanımlarında ORDER BY bulunmalı; yoksa eklenmesi önerilmeli "
                    "(detaya girmeden)."
                ),
            ),
            RuleLine(
                id="Kural24",
                text="Calendar tablosunun doğru kullanımı (tarih köprüleme ve filtreler).",
            ),
            RuleLine(
                id="Kural25",
                text=(
                    "Performansa net zarar vereceği kesin olan kullanımlar işaretlenmeli; yalnızca "
                    "tahmin seviyesindeki şüpheler bu maddeye yazılmamalı."
                ),
            ),
        ],
    )


def _normalize_bundle(raw: RuleBundle) -> RuleBundle:
    """Boş metinli satırları at; id yoksa sıradaki KuralNN (Kural01, Kural02, …)."""
    used: set[str] = set()
    for line in raw.critical + raw.normal:
        t = (line.text or "").strip()
        if not t:
            continue
        rid = (line.id or "").strip()
        if rid:
            used.add(rid)

    crit: list[RuleLine] = []
    for line in raw.critical:
        t = (line.text or "").strip()
        if not t:
            continue
        rid = (line.id or "").strip()
        if not rid:
            rid = _next_rule_id(used)
        crit.append(RuleLine(id=rid, text=t, requires_metadata=line.requires_metadata))
    norm: list[RuleLine] = []
    for line in raw.normal:
        t = (line.text or "").strip()
        if not t:
            continue
        rid = (line.id or "").strip()
        if not rid:
            rid = _next_rule_id(used)
        norm.append(RuleLine(id=rid, text=t, requires_metadata=line.requires_metadata))
    return RuleBundle(critical=crit, normal=norm)


def _read_file() -> RulesState | None:
    if not _RULES_FILE.is_file():
        return None
    try:
        data = json.loads(_RULES_FILE.read_text(encoding="utf-8"))
        return RulesState.model_validate(data)
    except Exception as e:
        logger.exception("Failed to read %s: %s", _RULES_FILE, e)
        return None


def _write_file(state: RulesState) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _RULES_FILE.with_suffix(".tmp")
    payload = state.model_dump(mode="json")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(_RULES_FILE)


def load_state() -> RulesState:
    with _lock:
        state = _read_file()
        if state is None:
            b = _default_bundle()
            now = _utc_now_iso()
            state = RulesState(draft=b, published=b.model_copy(deep=True), published_at=now)
            try:
                _write_file(state)
            except OSError as e:
                logger.warning("Could not persist default rules file: %s", e)
        return state


def save_draft(bundle: RuleBundle) -> RulesState:
    bundle = _normalize_bundle(bundle)
    with _lock:
        state = _read_file()
        if state is None:
            b = _default_bundle()
            state = RulesState(draft=b, published=b.model_copy(deep=True), published_at=_utc_now_iso())
        state.draft = bundle
        _write_file(state)
        return state


def publish_draft() -> RulesState:
    with _lock:
        state = _read_file()
        if state is None:
            b = _default_bundle()
            state = RulesState(draft=b, published=b.model_copy(deep=True), published_at=_utc_now_iso())
        else:
            state.published = state.draft.model_copy(deep=True)
            state.published_at = _utc_now_iso()
        _write_file(state)
        return state


def published_bundle() -> RuleBundle:
    """LLM ve önizleme için yayınlanmış kurallar."""
    with _lock:
        state = _read_file()
        if state is None:
            b = _default_bundle()
            return b
        return state.published.model_copy(deep=True)


def format_rules_for_llm(bundle: RuleBundle) -> str:
    """Yayınlanmış kuralları tek metin bloğuna çevirir (LLM user prompt şablonu ile uyumlu başlıklar)."""
    b = _normalize_bundle(bundle)
    parts: list[str] = []
    parts.append("## ÇOK ÖNEMLİ (CRITICAL)")
    if b.critical:
        for line in b.critical:
            parts.append(f"- [{line.id}] {line.text}")
    else:
        parts.append("- (tanımlı kural yok)")

    parts.append("")
    parts.append("## ÖNEMLİ (NORMAL)")
    if b.normal:
        for line in b.normal:
            parts.append(f"- [{line.id}] {line.text}")
    else:
        parts.append("- (tanımlı kural yok)")

    return "\n".join(parts)


def iter_rule_ids_ordered(bundle: RuleBundle) -> list[tuple[str, str]]:
    """(rule_id, tier) sırası: önce critical, sonra normal."""
    b = _normalize_bundle(bundle)
    out: list[tuple[str, str]] = []
    for line in b.critical:
        out.append((line.id, "critical"))
    for line in b.normal:
        out.append((line.id, "normal"))
    return out


def bundle_needs_catalog_metadata(bundle: RuleBundle) -> bool:
    """Yayınlanmış kurallardan herhangi biri katalog (bağımlılık + kolon) metadatası istiyor mu."""
    b = _normalize_bundle(bundle)
    for line in b.critical + b.normal:
        if line.requires_metadata:
            return True
    return False


def get_rule_line(bundle: RuleBundle, rule_id: str) -> RuleLine | None:
    """Yayınlanmış bundle içinde id ile tek satır döndürür (yoksa None)."""
    rid = (rule_id or "").strip()
    if not rid:
        return None
    b = _normalize_bundle(bundle)
    for line in b.critical + b.normal:
        if line.id == rid:
            return line
    return None


def format_rule_ids_for_prompt(bundle: RuleBundle) -> str:
    """LLM'in her kural için sonuç döndürmesi gereken id listesi (okunaklı JSON dizi)."""
    ids = [rid for rid, _ in iter_rule_ids_ordered(bundle)]
    return json.dumps(ids, ensure_ascii=False, indent=2)
