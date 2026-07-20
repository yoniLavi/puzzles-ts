/**
 * Group data table — the 77 groups (orders 2–26) and the by-order index,
 * transcribed *verbatim* from `puzzles/unfinished/group.c`'s `groupdata[]` /
 * `groups[]` (generated upstream by `group.gap`, a GAP computer-algebra dump).
 *
 * This file is generated data, not logic (design D2): each group is a compressed
 * Cayley table — `gens` is `ngens` rows of `order` capital letters, one
 * generator per row, that the generator's BFS (`generator.ts`) decompresses into
 * the full table. `autosize` is upstream's automorphism-count annotation, unused
 * by game logic but carried for provenance. A transcription slip here is silent
 * until the byte-match differential fires, so it is machine-extracted from the C.
 */

export interface GroupDatum {
  readonly autosize: number;
  readonly order: number;
  readonly ngens: number;
  /** `ngens · order` capital letters: `ngens` generator rows concatenated. */
  readonly gens: string;
}

export const GROUP_DATA: readonly GroupDatum[] = [
  { autosize: 1, order: 2, ngens: 1, gens: "BA" },
  { autosize: 2, order: 3, ngens: 1, gens: "BCA" },
  { autosize: 2, order: 4, ngens: 1, gens: "BCDA" },
  { autosize: 6, order: 4, ngens: 2, gens: "BADCCDAB" },
  { autosize: 4, order: 5, ngens: 1, gens: "BCDEA" },
  { autosize: 6, order: 6, ngens: 2, gens: "CFEBADBADCFE" },
  { autosize: 2, order: 6, ngens: 1, gens: "DCFEBA" },
  { autosize: 6, order: 7, ngens: 1, gens: "BCDEFGA" },
  { autosize: 4, order: 8, ngens: 1, gens: "BCEFDGHA" },
  { autosize: 8, order: 8, ngens: 2, gens: "BDEFGAHCEGBHDCFA" },
  { autosize: 8, order: 8, ngens: 2, gens: "EGBHDCFABAEFCDHG" },
  { autosize: 24, order: 8, ngens: 2, gens: "BDEFGAHCCHDGBEAF" },
  { autosize: 168, order: 8, ngens: 3, gens: "BAEFCDHGCEAGBHDFDFGAHBCE" },
  { autosize: 6, order: 9, ngens: 1, gens: "BDECGHFIA" },
  { autosize: 48, order: 9, ngens: 2, gens: "BDEAGHCIFCEFGHAIBD" },
  { autosize: 20, order: 10, ngens: 2, gens: "CJEBGDIFAHBADCFEHGJI" },
  { autosize: 4, order: 10, ngens: 1, gens: "DCFEHGJIBA" },
  { autosize: 10, order: 11, ngens: 1, gens: "BCDEFGHIJKA" },
  { autosize: 12, order: 12, ngens: 2, gens: "GLDKJEHCBIAFBCEFAGIJDKLH" },
  { autosize: 4, order: 12, ngens: 1, gens: "EHIJKCBLDGFA" },
  { autosize: 24, order: 12, ngens: 2, gens: "BEFGAIJKCDLHFJBKHLEGDCIA" },
  { autosize: 12, order: 12, ngens: 2, gens: "GLDKJEHCBIAFBAEFCDIJGHLK" },
  { autosize: 12, order: 12, ngens: 2, gens: "FDIJGHLBKAECGIDKFLHCJEAB" },
  { autosize: 12, order: 13, ngens: 1, gens: "BCDEFGHIJKLMA" },
  { autosize: 42, order: 14, ngens: 2, gens: "ELGNIBKDMFAHCJBADCFEHGJILKNM" },
  { autosize: 6, order: 14, ngens: 1, gens: "FEHGJILKNMBADC" },
  { autosize: 8, order: 15, ngens: 1, gens: "EGHCJKFMNIOBLDA" },
  { autosize: 8, order: 16, ngens: 1, gens: "MKNPFOADBGLCIEHJ" },
  { autosize: 96, order: 16, ngens: 2, gens: "ILKCONFPEDJHGMABBDFGHIAKLMNCOEPJ" },
  { autosize: 32, order: 16, ngens: 2, gens: "MIHPFDCONBLAKJGEBEFGHJKALMNOCDPI" },
  { autosize: 32, order: 16, ngens: 2, gens: "IFACOGLMDEJBNPKHBEFGHJKALMNOCDPI" },
  { autosize: 16, order: 16, ngens: 2, gens: "MOHPFKCINBLADJGEBDFGHIEKLMNJOAPC" },
  { autosize: 16, order: 16, ngens: 2, gens: "MIHPFDJONBLEKCGABDFGHIEKLMNJOAPC" },
  { autosize: 32, order: 16, ngens: 2, gens: "MOHPFDCINBLEKJGABAFGHCDELMNIJKPO" },
  { autosize: 16, order: 16, ngens: 2, gens: "MIHPFKJONBLADCGEGDPHNOEKFLBCIAMJ" },
  { autosize: 32, order: 16, ngens: 2, gens: "MIBPFDJOGHLEKCNACLEIJGMPKAOHNFDB" },
  {
    autosize: 192,
    order: 16,
    ngens: 3,
    gens: "MCHPFAIJNBLDEOGKBEFGHJKALMNOCDPIGKLBNOEDFPHJIAMC",
  },
  {
    autosize: 64,
    order: 16,
    ngens: 3,
    gens: "MCHPFAIJNBLDEOGKLOGFPKJIBNMEDCHACMAIJHPFDEONBLKG",
  },
  {
    autosize: 192,
    order: 16,
    ngens: 3,
    gens: "IPKCOGMLEDJBNFAHBEFGHJKALMNOCDPICMEIJBPFKAOGHLDN",
  },
  {
    autosize: 48,
    order: 16,
    ngens: 3,
    gens: "IPDJONFLEKCBGMAHFJBLMEOCGHPKAINDDGIEKLHNJOAMPBCF",
  },
  {
    autosize: 20160,
    order: 16,
    ngens: 4,
    gens: "EHJKAMNBOCDPFGILBAFGHCDELMNIJKPOCFAIJBLMDEOGHPKNDGIAKLBNCOEFPHJM",
  },
  { autosize: 16, order: 17, ngens: 1, gens: "EFGHIJKLMNOPQABCD" },
  { autosize: 54, order: 18, ngens: 2, gens: "MKIQOPNAGLRECDBJHFBAEFCDJKLGHIOPMNRQ" },
  { autosize: 6, order: 18, ngens: 1, gens: "ECJKGHFOPDMNLRIQBA" },
  { autosize: 12, order: 18, ngens: 2, gens: "ECJKGHBOPAMNFRDQLIKNOPQCFREIGHLJAMBD" },
  {
    autosize: 432,
    order: 18,
    ngens: 3,
    gens: "IFNAKLQCDOPBGHREMJNOQCFRIGHKLJAMPBDEBAEFCDJKLGHIOPMNRQ",
  },
  { autosize: 48, order: 18, ngens: 2, gens: "ECJKGHBOPAMNFRDQLIFDKLHIOPBMNAREQCJG" },
  { autosize: 18, order: 19, ngens: 1, gens: "EFGHIJKLMNOPQRSABCD" },
  {
    autosize: 40,
    order: 20,
    ngens: 2,
    gens: "GTDKREHOBILSFMPCJQANEABICDFMGHJQKLNTOPRS",
  },
  { autosize: 8, order: 20, ngens: 1, gens: "EHIJLCMNPGQRSKBTDOFA" },
  {
    autosize: 20,
    order: 20,
    ngens: 2,
    gens: "DJSHQNCLTRGPEBKAIFOMEABICDFMGHJQKLNTOPRS",
  },
  {
    autosize: 40,
    order: 20,
    ngens: 2,
    gens: "GTDKREHOBILSFMPCJQANECBIAGFMDKJQHONTLSRP",
  },
  {
    autosize: 24,
    order: 20,
    ngens: 2,
    gens: "IGFMDKJQHONTLSREPCBAFDIJGHMNKLQROPTBSAEC",
  },
  {
    autosize: 42,
    order: 21,
    ngens: 2,
    gens: "ITLSBOUERDHAGKCJNFMQPEJHLMKOPNRSQAUTCDBFGI",
  },
  { autosize: 12, order: 21, ngens: 1, gens: "EGHCJKFMNIPQLSTOUBRDA" },
  {
    autosize: 110,
    order: 22,
    ngens: 2,
    gens: "ETGVIBKDMFOHQJSLUNAPCRBADCFEHGJILKNMPORQTSVU",
  },
  { autosize: 10, order: 22, ngens: 1, gens: "FEHGJILKNMPORQTSVUBADC" },
  { autosize: 22, order: 23, ngens: 1, gens: "EFGHIJKLMNOPQRSTUVWABCD" },
  {
    autosize: 24,
    order: 24,
    ngens: 2,
    gens: "QXEJWPUMKLRIVBFTSACGHNDOHRNOPSWCTUVBLDIJXFGAKQME",
  },
  { autosize: 8, order: 24, ngens: 1, gens: "MQBTUDRWFGHXJELINOPKSAVC" },
  {
    autosize: 24,
    order: 24,
    ngens: 2,
    gens: "IOQRBEUVFWGHKLAXMNPSCDTJNJXOVGDKSMTFIPQELCURBWAH",
  },
  {
    autosize: 48,
    order: 24,
    ngens: 2,
    gens: "QUEJWVXFKLRIPGMNSACBOTDHHSNOPWLDTUVBRIAKXFGCQEMJ",
  },
  {
    autosize: 24,
    order: 24,
    ngens: 2,
    gens: "QXEJWPUMKLRIVBFTSACGHNDOTWHNXLRIOPUMSACQVBFDEJGK",
  },
  {
    autosize: 48,
    order: 24,
    ngens: 2,
    gens: "QUEJWVXFKLRIPGMNSACBOTDHBAFGHCDEMNOPIJKLTUVQRSXW",
  },
  {
    autosize: 48,
    order: 24,
    ngens: 3,
    gens: "QXKJWVUMESRIPGFTLDCBONAHJUEQRPXFKLWCVBMNSAIGHTDOHSNOPWLDTUVBRIAKXFGCQEMJ",
  },
  {
    autosize: 24,
    order: 24,
    ngens: 3,
    gens: "QUKJWPXFESRIVBMNLDCGHTAOJXEQRVUMKLWCPGFTSAIBONDHTRONXLWCHVUMSAIJPGFDEQBK",
  },
  {
    autosize: 16,
    order: 24,
    ngens: 2,
    gens: "MRGTULWIOPFXSDJQBVNEKCHAVKXHOQASNTPBCWDEUFGIJLMR",
  },
  {
    autosize: 16,
    order: 24,
    ngens: 2,
    gens: "MRGTULWIOPFXSDJQBVNEKCHARMLWIGTUSDJQOPFXEKCBVNAH",
  },
  {
    autosize: 48,
    order: 24,
    ngens: 2,
    gens: "IULQRGXMSDCWOPNTEKJBVFAHGLMOPRSDTUBVWIEKFXHJQANC",
  },
  {
    autosize: 24,
    order: 24,
    ngens: 2,
    gens: "UJPXMRCSNHGTLWIKFVBEDQOANRUFVLWIPXMOJEDQHGTCSABK",
  },
  {
    autosize: 24,
    order: 24,
    ngens: 2,
    gens: "MIBTUAQRFGHXCDEWNOPJKLVSOKXVFWSCGUTNDRQJBPMALIHE",
  },
  {
    autosize: 144,
    order: 24,
    ngens: 3,
    gens: "QXKJWVUMESRIPGFTLDCBONAHJUEQRPXFKLWCVBMNSAIGHTDOBAFGHCDEMNOPIJKLTUVQRSXW",
  },
  {
    autosize: 336,
    order: 24,
    ngens: 3,
    gens: "QTKJWONXESRIHVUMLDCPGFABJNEQRHTUKLWCOPXFSAIVBMDGHENOPJKLTUVBQRSAXFGWCDMI",
  },
  { autosize: 20, order: 25, ngens: 1, gens: "EHILMNPQRSFTUVBJWXDOYGAKC" },
  {
    autosize: 480,
    order: 25,
    ngens: 2,
    gens: "EHILMNPQRSCTUVBFWXDJYGOKABDEGHIKLMNAPQRSCTUVFWXJYO",
  },
  {
    autosize: 156,
    order: 26,
    ngens: 2,
    gens: "EXGZIBKDMFOHQJSLUNWPYRATCVBADCFEHGJILKNMPORQTSVUXWZY",
  },
  { autosize: 12, order: 26, ngens: 1, gens: "FEHGJILKNMPORQTSVUXWZYBADC" },
];

/** By-order index (upstream `groups[]`): `GROUPS[order]` gives the count of
 * groups of that order and the offset of the first into {@link GROUP_DATA}.
 * Indices 0 and 1 are trivial placeholders (`count: 0`). */
export interface GroupsByOrder {
  readonly count: number;
  /** Offset into {@link GROUP_DATA}, or -1 when `count === 0`. */
  readonly offset: number;
}

export const GROUPS: readonly GroupsByOrder[] = [
  { count: 0, offset: -1 },
  { count: 0, offset: -1 },
  { count: 1, offset: 0 },
  { count: 1, offset: 1 },
  { count: 2, offset: 2 },
  { count: 1, offset: 4 },
  { count: 2, offset: 5 },
  { count: 1, offset: 7 },
  { count: 5, offset: 8 },
  { count: 2, offset: 13 },
  { count: 2, offset: 15 },
  { count: 1, offset: 17 },
  { count: 5, offset: 18 },
  { count: 1, offset: 23 },
  { count: 2, offset: 24 },
  { count: 1, offset: 26 },
  { count: 14, offset: 27 },
  { count: 1, offset: 41 },
  { count: 5, offset: 42 },
  { count: 1, offset: 47 },
  { count: 5, offset: 48 },
  { count: 2, offset: 53 },
  { count: 2, offset: 55 },
  { count: 1, offset: 57 },
  { count: 15, offset: 58 },
  { count: 2, offset: 73 },
  { count: 2, offset: 75 },
];
