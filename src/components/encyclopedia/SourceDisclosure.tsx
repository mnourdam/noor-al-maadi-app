/** Inclusion disclosure, not a claim about external verification or authenticity. */
export const SOURCE_DISCLOSURE = 'هذه المراجع مسجّلة مع المقال؛ إدراجها هنا لا يعني التحقق من دقة نسبتها أو مطابقتها لكل ما ورد فيه.';
export function SourceDisclosure(){
 return <p lang="ar" dir="rtl" data-source-disclosure className="mb-3 text-[12px] leading-6 text-foreground/80">{SOURCE_DISCLOSURE}</p>;
}
