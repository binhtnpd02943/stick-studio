import { vi } from '../../i18n/vi'
import type { MemberKey } from './team'

export const INK = 'var(--ink)'
export const ACCENT = 'var(--accent)'
export const PILL = 'var(--pill)'
export const BG = 'var(--bg)'
export const LINE = 'var(--line)'
export const BODY = 'var(--body)'
export const FAINT = 'var(--faint)'
export const MONO = 'var(--mono)'

/** Rooms, walls, doors and furniture from the mockup; the working member's gear glows. */
export function Furniture({ working, final, motion }: { working: MemberKey | null; final: boolean; motion: boolean }) {
  const glow = (key: MemberKey) => (working === key ? ACCENT : PILL)
  return (
    <svg className="studio-furniture" width="1280" height="1000" viewBox="0 0 1280 1000">
    <g fill={PILL}><rect x="24" y="80" width="676" height="340"></rect><rect x="720" y="80" width="536" height="340"></rect><rect x="24" y="560" width="356" height="340"></rect><rect x="400" y="560" width="856" height="340"></rect></g>
    <g fill="none" stroke={LINE} strokeWidth="1.5"><path d="M24 400 L700 400 M720 400 L1256 400 M24 540 L1256 540 M24 880 L380 880 M400 880 L1256 880"></path></g>
    <g fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round">
    <path d="M600 420 L24 420 L24 80 L700 80 L700 420 L680 420"></path>
    <path d="M740 420 L720 420 L720 80 L1256 80 L1256 420 L820 420"></path>
    <path d="M280 560 L24 560 L24 900 L380 900 L380 560 L360 560"></path>
    <path d="M440 560 L400 560 L400 900 L1256 900 L1256 560 L1060 560 M980 560 L520 560"></path>
    </g>
    <g fontFamily={MONO} fontSize="11" fill={BODY}><text x="40" y="102">{vi.studio.rooms.creative}</text><text x="736" y="102">{vi.studio.rooms.studio}</text><text x="40" y="582">{vi.studio.rooms.review}</text><text x="416" y="582">{vi.studio.rooms.post}</text><text x="100" y="440">{vi.studio.rooms.entrance}</text><text x="1000" y="440">{vi.studio.rooms.coffee}</text><text x="580" y="440">{vi.studio.rooms.corridor}</text></g>
    <g fill={BG} stroke={INK} strokeWidth="2"><rect x="240" y="116" width="120" height="56" rx="2"></rect><rect x="380" y="116" width="120" height="56" rx="2"></rect><rect x="760" y="116" width="80" height="56" rx="2"></rect><rect x="60" y="604" width="100" height="50" rx="2"></rect><rect x="600" y="604" width="100" height="50" rx="2"></rect><rect x="760" y="604" width="100" height="50" rx="2"></rect></g>
    <g stroke={INK} strokeWidth="1.5"><path d="M300 116 L300 172 M440 116 L440 172 M800 116 L800 172 M110 604 L110 654 M650 604 L650 654 M810 604 L810 654"></path></g>
    <circle cx="590" cy="140" r="16" fill={BG} stroke={INK} strokeWidth="2"></circle><path d="M590 140 L590 130 M590 140 L597 144" stroke={INK} strokeWidth="2" strokeLinecap="round"></path>
    <rect x="60" y="190" width="110" height="140" rx="3" fill={BG} stroke={INK} strokeWidth="2.5"></rect>
    <g stroke={INK} strokeWidth="1.5"><rect x="70" y="202" width="22" height="22" fill={PILL}></rect><rect x="98" y="202" width="22" height="22" fill={glow('story')}></rect><rect x="126" y="202" width="22" height="22" fill={ACCENT}></rect><rect x="70" y="230" width="22" height="22" fill={ACCENT}></rect><rect x="98" y="230" width="22" height="22" fill={PILL}></rect><rect x="126" y="230" width="22" height="22" fill={glow('story')}></rect><rect x="70" y="258" width="22" height="22" fill={PILL}></rect><rect x="126" y="258" width="22" height="22" fill={PILL}></rect><rect x="98" y="286" width="22" height="22" fill={glow('story')}></rect></g>
    <g fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M70 330 L70 400 M160 330 L160 400"></path>
    <path d="M378 354 Q440 344 502 354 Q440 362 378 354 Z" fill={BG}></path><path d="M440 360 L440 400 M422 400 L458 400 M408 352 L438 352 M446 352 L474 352"></path>
    <path d="M950 304 L950 400 M938 400 L962 400"></path>
    <path d="M1104 320 L1104 400 M1226 320 L1226 400"></path>
    <path d="M40 440 L84 440 L84 540 M40 440 L40 540 M40 474 L84 474 M40 508 L84 508"></path>
    <path d="M160 494 L264 494 M166 494 L166 540 M258 494 L258 540 M237 486 L237 494"></path>
    <path d="M1000 540 L1000 500 Q1000 490 1010 490 L1130 490 Q1140 490 1140 500 L1140 540 M996 516 L1144 516 M1070 492 L1070 516"></path>
    <path d="M1180 450 L1220 450 L1220 540 L1180 540 Z M1186 464 L1214 464 M1192 496 L1208 496 L1206 510 L1194 510 Z"></path>
    <path d="M150 834 L270 834 M156 834 L156 880 M264 834 L264 880 M227 828 L227 834 M110 852 L140 852 M112 852 L110 822 M125 852 L125 880 M115 880 L135 880"></path>
    <path d="M1136 812 L1210 812 M1142 812 L1142 880 M1204 812 L1204 880 M1170 806 L1170 812"></path>
    <path d="M840 834 L960 834 M846 834 L846 880 M954 834 L954 880 M878 828 L878 834 M922 828 L922 834"></path>
    <path d="M600 800 L584 880 M600 800 L616 880 M600 800 L600 880 M680 780 L680 880 M668 880 L692 880"></path>
    </g>
    <rect x="412" y="332" width="22" height="18" rx="2" fill={glow('screenplay')} stroke={INK} strokeWidth="2"></rect>
    <rect x="448" y="332" width="22" height="18" rx="2" fill={glow('validate')} stroke={INK} strokeWidth="2"></rect>
    <rect x="860" y="200" width="150" height="200" rx="6" fill={BG} fillOpacity=".6" stroke={INK} strokeWidth="2"></rect>
    <path d="M970 220 L996 246 M978 212 L1000 234" stroke={FAINT} strokeWidth="2" strokeLinecap="round"></path>
    <rect x="900" y="176" width="70" height="20" rx="4" fill={working === 'voice' ? ACCENT : PILL} stroke={INK} strokeWidth="2"></rect><text x="935" y="190" textAnchor="middle" fontFamily={MONO} fontSize="10" fill={INK}>{vi.studio.onAir}</text>
    <rect x="945" y="286" width="10" height="18" rx="5" fill={INK}></rect>
    <rect x="1090" y="210" width="150" height="110" rx="3" fill={BG} stroke={INK} strokeWidth="2.5"></rect>
    <g stroke={INK} strokeWidth="1.5"><rect x="1098" y="222" width="42" height="32" fill={PILL}></rect><rect x="1144" y="222" width="42" height="32" fill={glow('timeline')}></rect><rect x="1190" y="222" width="42" height="32" fill={PILL}></rect><path d="M1100 272 L1136 272 M1146 272 L1180 272 M1192 272 L1228 272 M1100 288 L1124 288 M1146 288 L1170 288" fill="none"></path></g>
    <g fill={ACCENT} stroke={INK} strokeWidth="1.5"><rect x="46" y="458" width="14" height="14"></rect><rect x="64" y="492" width="14" height="14"></rect><rect x="46" y="524" width="16" height="14"></rect></g>
    <g fill={BG} stroke={INK} strokeWidth="1.5"><rect x="62" y="460" width="12" height="12"></rect><rect x="48" y="492" width="14" height="14"></rect><rect x="168" y="484" width="20" height="10"></rect></g>
    <rect x="220" y="460" width="34" height="26" rx="3" fill={glow('intake')} stroke={INK} strokeWidth="2.5"></rect>
    <circle cx="1210" cy="457" r="3" fill={ACCENT}></circle><path className={motion ? 'steam' : undefined} d="M1198 490 Q1201 486 1198 482" fill="none" stroke={FAINT} strokeWidth="1.5" strokeLinecap="round"></path>
    <g fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M640 380 L664 380 L660 400 L644 400 Z"></path><g className={motion ? 'lean' : undefined}><path d="M652 380 L652 344 M652 364 Q636 358 634 342 Q648 344 652 358 M652 356 Q668 348 672 332 Q656 334 652 350"></path></g></g>
    <rect x="210" y="800" width="34" height="28" rx="3" fill={PILL} stroke={INK} strokeWidth="2.5"></rect>
    {final && <g className={motion ? 'studio-final-card pop' : 'studio-final-card'}><rect x="164" y="816" width="16" height="18" rx="2" fill={ACCENT} stroke={INK} strokeWidth="2"></rect><path d="M170 821 L170 829 L176 825 Z" fill={INK}></path></g>}
    <rect x="1152" y="778" width="36" height="28" rx="3" fill={glow('gate')} stroke={INK} strokeWidth="2.5"></rect>
    <rect x="860" y="800" width="36" height="28" rx="3" fill={glow('render')} stroke={INK} strokeWidth="2.5"></rect>
    <rect x="904" y="800" width="36" height="28" rx="3" fill={glow('render')} stroke={INK} strokeWidth="2.5"></rect>
    <rect x="970" y="780" width="30" height="100" rx="3" fill={BG} stroke={INK} strokeWidth="2.5"></rect>
    <g className={motion && working === 'render' ? 'blinky' : undefined} fill={glow('render')} stroke={INK} strokeWidth="1"><circle cx="978" cy="794" r="3"></circle><circle cx="978" cy="808" r="3"></circle><circle cx="978" cy="822" r="3"></circle></g>
    <rect x="588" y="786" width="26" height="16" rx="2" fill={BG} stroke={INK} strokeWidth="2.5"></rect><circle cx="618" cy="794" r="5" fill={BG} stroke={INK} strokeWidth="2"></circle>
    <path d="M662 752 L698 752 L692 780 L668 780 Z" fill={glow('contact')} stroke={INK} strokeWidth="2.5" strokeLinejoin="round"></path>
    </svg>
  )
}
