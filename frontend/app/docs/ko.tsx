"use client";

/**
 * Korean overrides. This is the only file a translator touches.
 *
 * # How it works
 *
 * `KO` is keyed by section id. When the page is in Korean, `<Section id="x">` renders `KO.x()`
 * instead of its English children; when there is no entry for `x`, it renders the English. A
 * missing key *is* the fallback, so an untranslated section needs no placeholder, no key and no
 * work.
 *
 * # Adding a section
 *
 *   1. Take the section's id from `SECTION_IDS` in `docs-data.ts`. That id is the key, and
 *      TypeScript rejects anything that is not one of them.
 *   2. Add `"<id>": () => (<>...</>),` to `KO` below, in document order.
 *   3. Translate the prose and the headings. Keep the same class names as the English section
 *      (`docs-definition-list`, `docs-callout`, `docs-steps`, `docs-section-heading`, ...) so it
 *      keeps its styling.
 *
 * # What must stay English, in both languages
 *
 * Code blocks, ABI signatures, addresses, JSON bodies and the aggregator's literal error strings
 * are wire values, not prose. A reader matching them against their own logs has to see the
 * English. So:
 *
 *   - Never paste a payload in here. Import the block from `./docs-blocks` and render it. The
 *     addresses and signatures then live in exactly one place and cannot drift.
 *   - `<CodeBlock label="..." code={sharedConst} />`: the label is a caption and gets translated,
 *     the `code` is imported and does not.
 *   - Inline identifiers use `<C>minAmountOut</C>` instead of `<code>`. `C` carries
 *     `lang="en" translate="no"`, which marks it as an English island inside Korean text.
 *
 * The header of `docs-blocks.tsx` carries a one-line grep over this file that fails on a pasted
 * payload. Run it before committing a translation.
 *
 * # House rules this file follows
 *
 *   - No em dash and no en dash anywhere in the rendered text, in either language.
 *   - An identifier keeps its English spelling, its case and its dotted path, and the Korean
 *     particle attaches straight to it: `maxBid`가, `refreshCapacity`를, `PropPool`에서.
 *   - Terms that name a stored field stay Latin even where a Hangul word exists, because the
 *     reader will grep for them: `capacity`, `epoch`, `quote word`, `venue`, `bps`, `calldata`,
 *     `NAV`, `RFQ`, `AMM`. Mixing `epoch` and `에포크` across a page is worse than either.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { AGGREGATOR, GIWA_CHAIN_ID, TOKENS } from "@/app/lib/dubu";
import {
  ArchitectureDiagram,
  C,
  CodeBlock,
  ContractsTable,
  MarketsTable,
  QuoteWordDiagram,
} from "./docs-blocks";
import {
  PERMIT2,
  approvePath,
  errorNoMarket,
  errorNoVenue,
  errorRepricing,
  marketsRequest,
  marketsResponse,
  permit2Path,
  quoteRequest,
  quoteResponse,
  wordLayout,
  type ContractName,
  type SectionId,
} from "./docs-data";

/**
 * Sidebar and table-of-contents labels, keyed by the English label rather than by section id.
 *
 * It has to be keyed by label: the sidebar's "Overview" and the contents list's "What Dubu is"
 * both point at `#overview`, so an id-keyed map could not give them different Korean.
 *
 * Anything not listed falls back to the English, which is why the product names ("Dubu
 * Aggregator", "Dubu Aggregator API", "Permit2") and the endpoints ("POST /quote",
 * "GET /markets") are simply absent.
 */
export const KO_NAV: Record<string, string> = {
  // Sidebar group titles.
  Protocol: "프로토콜",
  Reference: "레퍼런스",

  // Sidebar links.
  Overview: "개요",
  Architecture: "아키텍처",
  "The engine": "엔진",
  "Deployed addresses": "배포된 주소",
  "Pricing model": "가격 모델",
  "Capacity and epochs": "Capacity와 epoch",
  "Guards and roles": "가드와 역할",
  Errors: "오류",
  Markets: "마켓",
  Integrating: "연동하기",

  // Contents-list labels that differ from the sidebar's. "Contracts" is both a group title and a
  // contents-list label, and takes the same Korean in either place.
  "What Dubu is": "Dubu는 무엇인가",
  Contracts: "컨트랙트",
};

/** The `what it does` column of the contracts table. Keyed by contract name, checked at compile time. */
const KO_CONTRACT_WHAT: Partial<Record<ContractName, string>> = {
  PropPool:
    "Dubu PropAMM, 자체 재고로 굴리는 풀입니다. 리저브를 직접 들고 있고, 페어마다 minBid, maxBid, minAsk, maxAsk를 한 워드에 저장하며, 자기 책으로 그 가격에 테이커를 체결합니다.",
  Router:
    "순수 실행기입니다. tokenIn을 끌어와 가중치대로 어댑터들에 나누고, 경로 전체에 하나의 최소 수령량을 강제한 뒤 tokenOut을 넘깁니다. venue를 고르는 일은 하지 않습니다.",
  PmmSettle:
    "Dubu RFQ의 결제 컨트랙트입니다. 메이커가 서명한 EIP-712 주문을 검증하고 transferFrom으로 양쪽 레그를 옮깁니다. 아무것도 수탁하지 않으며 부분 체결을 지원합니다.",
  PropPoolAdapter:
    "PropPool용 Router 측 어댑터입니다. 160바이트짜리 (base, quote, limitAmount, partnerId, deadline) 페이로드를 디코딩해 swapWithContractBalance를 호출합니다.",
  UniV2Adapter:
    "UniswapV2 페어용 Router 측 어댑터입니다. 페어 자신의 잔고 변화량으로 스왑 크기를 정하고 0.30퍼센트 상수곱 공식을 적용합니다.",
  PmmAdapter:
    "PmmSettle용 Router 측 어댑터입니다. 자기가 받은 자금과 주문에 남아 있는 양 중 작은 쪽을 체결하고, 남은 것은 돌려보냅니다.",
};

const KO_CONTRACT_HEADERS = ["컨트랙트", "주소", "하는 일", "주요 진입점"] as const;
const KO_MARKET_HEADERS = ["pairId", "심볼", "Base 주소", "소수 자릿수", "추종 대상"] as const;

/**
 * The Korean body of a section, as a thunk.
 *
 * A thunk rather than a node: a node would build the whole Korean element tree at module load
 * even when the page is in English. A thunk is called, not rendered, so it also cannot use hooks,
 * which is the right constraint. Components inside it (`CodeBlock` has state) mount normally.
 */
export const KO: Partial<Record<SectionId, () => ReactNode>> = {
  overview: () => (
    <>
      <div className="docs-eyebrow">기술 문서</div>
      <h1>Dubu 프로토콜.</h1>
      <p>
        GIWA 위에 유동성을 처음부터 세웁니다. Dubu PropAMM, Dubu Aggregator, Dubu RFQ 세 제품으로
        합니다.
      </p>
      <div className="docs-meta">
        <span>체인 {GIWA_CHAIN_ID} · GIWA Sepolia</span>
      </div>
    </>
  ),

  "what-is-dubu": () => (
    <>
      <h2>Dubu는 무엇인가</h2>
      <p>
        Dubu는 체인 {GIWA_CHAIN_ID}번 GIWA 위에 유동성을 만들어 내는 일을 하고, 그 수단은 직접 만든
        세 개의 제품 Dubu PropAMM, Dubu Aggregator, Dubu RFQ입니다. 이렇게 어린 체인에는 애초에
        라우팅해 넣을 유동성이 없습니다. 상장된 아홉 개 페어 중 일곱 개는 다른 온체인 venue가 아예
        없어서, 그 깊이를 Dubu가 직접 댑니다.
      </p>
      <div className="docs-definition-list">
        <div>
          <dt>Dubu PropAMM</dt>
          <dd>
            자체 재고로 굴리는 풀이며 <C>PropPool</C>로 배포되어 있습니다. 오프체인 엔진이 페어마다{" "}
            <C>minBid</C>, <C>maxBid</C>, <C>minAsk</C>, <C>maxAsk</C> 네 개의 가격을 게시하고, 풀은
            자기가 보유한 리저브로 그 가격에 테이커를 체결합니다. 가격 산정 어디에도 상수곱 커브는
            없습니다.
          </dd>
        </div>
        <div>
          <dt>Dubu Aggregator</dt>
          <dd>
            들어오는 모든 요청을 prop 풀, UniswapV2 풀, RFQ 메이커에 걸쳐 호가한 뒤, 이긴 쪽을
            실행하는 calldata를 <C>Router</C>에 그대로 보낼 수 있는 형태로 돌려줍니다. Cloudflare
            Worker로 돌아갑니다.
          </dd>
        </div>
        <div>
          <dt>Dubu RFQ</dt>
          <dd>
            호가하고 결제하는 경로입니다. 메이커가 EIP-712 주문을 오프체인에서 서명하면{" "}
            <C>PmmSettle</C>이 그것을 검증하고 <C>transferFrom</C>으로 양쪽 레그를 옮깁니다.
            수탁하는 것은 없습니다.
          </dd>
        </div>
      </div>
      <p>
        이 경로에서 자산을 맡아 두는 곳은 한 군데도 없습니다. 애그리게이터는 <C>to</C>와{" "}
        <C>data</C>를 돌려줄 뿐 키를 갖고 있지 않고, 최소 수령량은 그 calldata 안에 박혀 있으며,
        모든 전송은 지갑이 서명합니다. 애그리게이터가 털리면 나쁜 가격을 부를 수는 있습니다. 자금을
        옮길 수는 없습니다.
      </p>

      <div className="docs-callout">
        <span>◇</span>
        <div>
          <strong>테스트넷 배포</strong>
          <p>
            이 페이지의 모든 주소는 GIWA Sepolia에 올라가 있고 Blockscout에서 검증되어 있습니다.
            토큰은 전부 mock입니다.
          </p>
        </div>
      </div>
    </>
  ),

  architecture: () => (
    <>
      <h2>아키텍처</h2>
      <p>
        호가 하나가 거래가 되기까지 네 단계를 거칩니다. 가격을 쓰는 주체는 엔진 하나뿐이고, venue를
        비교하는 컴포넌트는 애그리게이터 하나뿐이며, Router는 아무것도 고르지 않는 순수 실행기입니다.
      </p>

      <ArchitectureDiagram
        caption={
          <>
            가격을 쓰는 주체는 엔진뿐이고, venue를 비교하는 주체는 애그리게이터뿐이며, 자금을 실제로
            옮기는 주체는 Router뿐입니다. 애그리게이터는 UniswapV2 페어를 Multicall3로 온체인에서
            읽고, prop 가격은 엔진에서 HTTP로 받습니다. 그 이유는 아래에 있습니다.
          </>
        }
      />

      <ol className="docs-steps">
        <li>
          <span>1</span>
          <div>
            <strong>엔진이 네 개의 가격을 게시합니다</strong>
            <p>
              외부 venue들에서 공정가를 뽑고, 스프레드만큼 벌리고, 현재 재고의 반대 방향으로 스큐를
              준 다음, 그렇게 나온 네 개의 가격과 페어 id를 256비트 한 워드에 담습니다. 이 워드는{" "}
              <C>updater</C> 키로 서명한 <C>PropPool.updateQuote(uint256[])</C>로 온체인에 올라갑니다.
              크기는 <C>refreshCapacity</C>로 따로 밀어 넣습니다. 가격이 바뀌는 것과 깊이가 바뀌는
              것은 서로 다른 트랜잭션입니다.
            </p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Dubu Aggregator가 그리드 전체를 호가합니다</strong>
            <p>
              입력의 0퍼센트부터 100퍼센트까지 10퍼센트 간격으로 열한 개의 분할 지점을 평가합니다.
              UniV2 쪽은 <C>getAmountsOut</C>을 묶은 Multicall3 배치 하나로, prop 쪽은 열한 개 수량을
              모두 담은 POST 한 번으로 엔진에 보냅니다. 두 요청은 같이 출발합니다. 분할 비율은 워커
              안에서 커브를 다시 구현해 계산하지 않고 venue들이 직접 준 답을 놓고 탐색합니다. 커브를
              두 번째로 구현하면 첫 번째와 어긋나고, 그 어긋남은 결국 사용자가 찾아내기 때문입니다.
            </p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Dubu RFQ에 그보다 나은 값을 요구합니다</strong>
            <p>
              가장 좋은 AMM 분할을 메이커에게 넘기면 메이커는 서명된 EIP-712 주문으로 답하거나
              거절합니다. 애그리게이터는 그와 별개로 메이커의 잔고와 <C>PmmSettle</C>에 대한 승인
              한도를 읽어, 둘 중 작은 값을 메이커가 실제로 내줄 수 있는 크기로 봅니다. RFQ는 전체
              크기에서만 비교합니다. 주문은 <C>takerAmount</C> 하나에 대해 서명되므로 RFQ로 쪼개려면
              메이커에 왕복이 한 번 더 필요한데, 그 이득은 온체인 그리드가 이미 대부분 가져간
              뒤입니다.
            </p>
          </div>
        </li>
        <li>
          <span>4</span>
          <div>
            <strong>Router가 이긴 쪽을 실행합니다</strong>
            <p>
              선택된 플랜은 한 홉 안의 가중 스텝들이 되고, <C>slippageBps</C>에서 유도한{" "}
              <C>minAmountOut</C>과 함께 <C>Router.swapExactIn</C>으로 인코딩됩니다. Router는{" "}
              <C>amountIn</C>을 끌어와 <C>weightBps</C>로 나누고, 각 레그에 자금을 넣은 뒤(AMM
              스텝이면 풀에, RFQ 스텝이면 어댑터에) <C>sellBase</C>나 <C>sellQuote</C>를 호출합니다.
              그다음 자기 <C>tokenOut</C> 잔고의 변화량을 재서 최소치에 못 미치면{" "}
              <C>InsufficientOutput</C>으로 되돌리고, 쓰지 않은 입력은 보낸 사람에게 환불하고,
              나머지를 <C>receiver</C>로 넘깁니다.
            </p>
          </div>
        </li>
      </ol>

      <div className="docs-callout">
        <span>◈</span>
        <div>
          <strong>prop 레그의 가격은 eth_call이 아니라 HTTP로 받습니다</strong>
          <p>
            풀을 온체인에서 읽으려면 현재 블록 안에서 게시된 quote word를 보기 위해 pending 상태가
            필요한데, GIWA는 pending 상태와 pending 타임스탬프를 서로 어긋나게 내려줍니다. 비교
            대상이 되는 상태의 <C>updatedAt</C>보다 <C>block.timestamp</C>가 앞서 있으면{" "}
            <C>PropPool</C>은 <C>STATUS_STALE</C>을 반환하고 모든 페어에서 0을 지급합니다. 그래서
            엔진이 <C>PropCurve.sol</C>을 정수 연산까지 그대로 옮긴 포트로 같은 커브를 직접
            계산합니다. 온체인 폴백은 일부러 두지 않았습니다. 엔진에 닿지 않으면 prop venue가 없는
            것으로 드러나야지, 다른 방식으로 틀린 두 번째 가격이 나와서는 안 되기 때문입니다.
          </p>
        </div>
      </div>

      <h3>GIWA 노드를 직접 운영합니다</h3>
      <p>
        직접 운영하는 이유는 취향이 아니라 측정값입니다. 공개 GIWA 엔드포인트는 노트북에서 보낸
        요청에는 12번 중 12번 답했지만, 같은 요청이 애그리게이터에서 나갈 때는 약 17퍼센트가
        실패했습니다. Cloudflare Worker의 이그레스 주소는 Cloudflare 전체와 공유되기 때문에, 노트북
        한 대로는 절대 닿지 않는 공개 RPC의 IP당 제한에 걸립니다. 읽기를 우리가 운영하는 노드로
        옮기고 나서 호가 가용률이 62.5퍼센트에서 95.2퍼센트가 되었습니다.
      </p>
      <p>
        노드는 op-reth <C>v2.3.0-9384bc5</C>이고, <C>web3_clientVersion</C>이 그렇게 답합니다. 자체
        장비에서 GIWA 풀 노드로 돌고 있습니다. <C>eth_syncing</C>은 false, <C>net_version</C>은
        91342, 헤드는 32,143,007 블록 근처입니다. 노드이지 시퀀서가 아닙니다. 시퀀서는 GIWA가
        운영하며, 여기서 그와 다른 주장을 하지 않습니다.
      </p>
      <p>
        엔진은 같은 장비의 <C>http://127.0.0.1:8545</C>와 <C>ws://127.0.0.1:8546</C>에서 이 노드를
        읽습니다. 읽기 경로에 네트워크 홉이 없고, 200 ms 주기가 돌아가려면 그래야 합니다. 보내는 쪽은
        다릅니다. 트랜잭션은 <C>https://sepolia-sequencer.giwa.io</C>로 바로 제출합니다.{" "}
        <C>--rollup.sequencer-http</C>를 주고 띄운 로컬 노드는 전송을 대신 전달하는데, 전달하지 않은
        채로 붙들고 있을 수 있기 때문입니다.
      </p>
      <p>
        애그리게이터는 Cloudflare에서 돌면서 <C>cloudflared</C> 터널(유닛{" "}
        <C>giwa-rpc-tunnel.service</C>)로 같은 노드에 닿습니다. 공개 GIWA 엔드포인트 두 곳,{" "}
        <C>https://sepolia-rpc-flashblocks.giwa.io</C>와 <C>https://sepolia-rpc.giwa.io</C>는 장식이
        아니라 실제로 동작하는 폴백으로 남겨 두었습니다. 워치독 <C>giwa-rpc-watch.timer</C>가 5분마다
        터널을 확인하고, 오래되면 알립니다.
      </p>
    </>
  ),

  engine: () => (
    <>
      <h2>엔진</h2>
      <p>
        마켓메이커는 Rust 서비스입니다. 피드, 공정가, 스프레드, 스큐, quote word, 정책, 트랜잭션
        순서로 한 사이클이 돌며, 200 ms마다 그리고 새 헤드가 올 때마다 아홉 개 페어를 한꺼번에
        처리합니다.
      </p>
      <div className="docs-definition-list">
        <div>
          <dt>피드</dt>
          <dd>
            웹소켓 오더북과, Pyth를 위한 HTTP 폴링입니다. 암호자산 다섯 페어는 Binance, OKX, Bybit을
            읽고, 주식 네 페어는 Hyperliquid를 읽으며 mAAPL과 mTSLA는 Pyth 피드를 두 번째 소스로 함께
            씁니다. Coinbase를 비롯한 나머지 커넥터도 크레이트 안에 들어 있습니다. 그것을 쓰도록
            설정된 페어가 지금 있든 없든 그렇습니다.
          </dd>
        </div>
        <div>
          <dt>공정가</dt>
          <dd>
            venue마다 마이크로 가격{" "}
            <C>
              (bid·askQty + ask·bidQty) / (bidQty + askQty)
            </C>
            을 하나씩 내놓습니다. 가중치가 교차로 걸려 있다는 점을 보십시오. 중간가가 놓치는 단기
            신호를 크기가 갖고 있으므로, 각 가격에 자기 크기를 곱하면 부호가 반대로 나옵니다. 이렇게
            모인 단면을 중앙값 절대편차로 걸러 낸 뒤 살아남은 것들을 평균 냅니다. venue가 너무 적거나
            서로 너무 어긋나면, 확신에 찬 틀린 값 대신 기준가를 아예 내지 않습니다.
          </dd>
        </div>
        <div>
          <dt>스프레드</dt>
          <dd>
            기본 하프 스프레드를 실현 변동성만큼 벌리고 상한을 씌웁니다. 체인 뷰가 나빠져 있는
            동안에는 더 벌립니다.
          </dd>
        </div>
        <div>
          <dt>스큐</dt>
          <dd>
            책 전체를 부호가 있는 만큼 통째로 밀어 줍니다. 분산과, 재고가 균형에서 얼마나 떨어져
            있는지에 비례하며, 매수 호가를 페어의 최소 가격 아래로 밀 수 없도록 클램프되어 있습니다.
          </dd>
        </div>
        <div>
          <dt>Quote word</dt>
          <dd>
            스큐된 중간가에서 매수 목표가와 매도 목표가가 나옵니다. 각 방향마다 한 epoch 전체에 걸친{" "}
            <em>평균</em> 체결가가 그 목표가에 떨어지도록 폭을 역산합니다. 네 개의 가격은 고정된
            오프셋으로 정해지는 것이 아니라, 풀이 거래하려는 크기가 정합니다.
          </dd>
        </div>
        <div>
          <dt>정책</dt>
          <dd>
            마지막 관문입니다. 정지 상태, 죽은 체인 뷰, 살아 있지 않은 피드, 오래된 체인 뷰,
            일시정지된 페어, 이미 날아가고 있는 푸시 중 하나라도 걸리면 중단합니다. 그 외에는 트리거가
            있을 때만 보냅니다. 불리한 방향의 드리프트, 풀 자신의 staleness 창이 만료되기 전에 넣는
            하트비트, 단순 주기, 그리고 맨 마지막으로 유리한 방향의 드리프트입니다. 드리프트는 현재
            사용량에서의 <em>실행 가능한 최상단</em>을 기준으로 재며, 사용량이 0일 때의 가격일 뿐인{" "}
            <C>maxBid</C>를 기준으로 재지 않습니다.
          </dd>
        </div>
        <div>
          <dt>트랜잭션</dt>
          <dd>
            의도 하나당 EIP-1559 봉투 하나입니다. 패킹된 워드 하나를 담은 <C>updateQuote</C>이거나,
            페어 하나에 대한 <C>refreshCapacity</C>입니다. 둘 다 <C>updater</C> 키에서 나갑니다.
          </dd>
        </div>
      </div>

      <h3>물러나는 것도 정상적인 결과입니다</h3>
      <p>
        가격 점프를 200 ms마다 훑는 별도의 고속 경로가 정책 관문 바깥에 따로 있습니다. 점프는
        가격으로 흡수할 수 없습니다. 움직임이 확인될 즈음이면 대개 이미 하프 스프레드를 넘어선
        뒤이므로, 대응은 다시 호가하는 것이 아니라 물러나는 것입니다.{" "}
        <C>refreshCapacity(pairId, 0, 0)</C>을 보내면 <C>PropPool</C>의 모든 호가 경로가 0을
        반환하고, 그 방향은 쿨오프 동안 내려간 채로 있습니다. 애그리게이터가 503, 일시적으로 리프라이싱
        중이라고 보고하는 상태가 이것입니다.
      </p>
      <p>
        쿨오프는 단순 타이머가 아닙니다. <em>가장 최근</em> 발동으로부터 충분한 시간이 지나고, 동시에
        직전 구간의 고점 대 저점 폭이 현재 임계 안으로 가라앉아야 풀립니다. 두 번째 파동이 오면
        거기에 이어서 재개되는 대신 쿨오프가 처음부터 다시 시작됩니다.
      </p>
      <p>
        그 위에는 래치되는 킬스위치가 있고, 판단 기준은 재평가와 거래 P&amp;L을 정확히 분리해 내는 NAV
        분해입니다. 이벤트 디코딩은 하지 않습니다. 재고는 거래가 있어야만 움직이므로, 거래가 없으면
        거래 항은 근사적으로가 아니라 정확히 0입니다. 여기에는 롤링 드로다운 한도와 누적 총손실 예산이
        함께 걸려 있습니다. 둘 다 래치되고, 원자적으로 기록되며, 시작할 때 다시 읽습니다. 그래서 멈춘
        책은 운영자가 가장 먼저 손대는 재시작을 지나서도 멈춘 채로 있습니다. 섀도 모드로도 돌 수
        있는데, 이때는 강제했을 판정을 계산하고 보고만 하며 실제로 강제하지는 않습니다.
      </p>

      <h3>하나의 커브, 두 개의 언어</h3>
      <p>
        가격 산정의 핵심은 다시 구현하지 않고 공유합니다. Rust 커브는 <C>PropCurve.sol</C>을 정수
        연산까지 그대로 옮긴 포트이고, 함수 이름도 반올림 방향도 같습니다. 둘은 생성된 벡터를 차분
        Solidity 테스트에서 재생하는 방식으로 서로 묶여 있습니다. 애그리게이터가 엔진에서 HTTP로 받은
        가격을 그 venue 자신의 산술로 취급할 수 있는 근거가 이것입니다.
      </p>
    </>
  ),

  contracts: () => (
    <>
      <h2>컨트랙트</h2>
      <p>
        여섯 개의 컨트랙트가 모두 GIWA Sepolia에 배포되어 있고 Blockscout에서 검증되어 있습니다.
        어댑터 세 개는 상태도 자금도 갖지 않습니다. Router가 상대 venue의 정체를 모른 채로 그것과
        대화할 수 있게 하려고 존재하며, 풀을 갈아 끼울 때 설정 변경만으로 끝나고 Router를 다시
        배포하지 않아도 된 이유가 이것입니다.
      </p>
      <ContractsTable headers={KO_CONTRACT_HEADERS} what={KO_CONTRACT_WHAT} />
      <p>
        라우트 스텝 하나는 <C>uint256</C>의 하위 160비트에 venue를 담고, [175:160] 비트에 가중치를
        담고, 최상위 두 비트에 플래그 두 개를 싣습니다. 하나는 방향을 뒤집고, 하나는 풀 대신 어댑터에
        자금을 넣습니다. Router는 그 사이의 예약 비트가 비어 있는지 확인한 다음에야 나머지를
        해석합니다.
      </p>
    </>
  ),

  pricing: () => (
    <>
      <h2>가격 모델</h2>
      <p>
        페어 하나는 핫 스토리지 세 워드를 씁니다. 하나는 네 개의 가격과 그것을 기록한 시각을, 하나는
        capacity와 그것이 속한 epoch을, 하나는 그 epoch이 얼마나 소진되었는지를 담습니다. 호가에
        필요한 것은 전부 이 세 번의 읽기 안에 있습니다.
      </p>

      <CodeBlock label="PropPool, 핫 스토리지 레이아웃" code={wordLayout} />
      <p>
        블록의 마지막 두 줄은 <C>updateQuote</C>이 받는 형태입니다. 타임스탬프가 찍히기 전의 워드를
        받으므로 [239:224]에 <C>pairId</C>가 들어가고 [223:0]에 네 개의 가격이 들어가며,
        [255:240]은 아무도 읽지 않고 [255:224] 전체와 함께 마스킹되어 버려집니다.
      </p>

      <QuoteWordDiagram
        caption={
          <>
            한 스토리지 워드 안에 담긴 <C>uint56</C> 가격 네 개입니다. <C>validateLadder</C>가{" "}
            <C>minBid ≤ maxBid ≤ minAsk ≤ maxAsk</C>와 <C>maxAsk &gt; minBid</C>를 요구하므로, 양쪽은
            맞닿을 수는 있어도 교차하지는 않습니다.
          </>
        }
      />

      <h3>가격은 정수입니다</h3>
      <p>
        네 개의 가격은 각각 <C>uint56</C>이고 <C>10^priceScaleExp</C>로 스케일됩니다.{" "}
        <C>priceScaleExp</C>는 페어마다 정해진 상수로, base와 quote의 소수 자릿수 차이를 흡수합니다.
        매수 쪽에서 풀은 base를 받고 <C>amountIn · p / 10^priceScaleExp</C>만큼의 quote 단위를
        지급하고, 매도 쪽에서는 같은 곱을 반대 방향으로 반올림해 청구합니다. 양쪽 모두 capacity와
        사용량을 <em>base</em> 토큰으로 셉니다.
      </p>

      <h3>epoch이 소진되는 동안 가격이 걸어갑니다</h3>
      <p>
        네 개의 가격은 고정된 두 개의 호가가 아니라 두 개의 선형 램프의 양 끝입니다. 한계 매수가는
        풀에 아무것도 팔리지 않았을 때 <C>maxBid</C>에서 출발해, <C>bidUsed</C>가{" "}
        <C>bidCapacity</C>에 이를 때까지 <C>minBid</C>까지 선형으로 내려갑니다. 한계 매도가는{" "}
        <C>minAsk</C>에서 출발해 <C>maxAsk</C>까지 올라갑니다. 거래에는 그 거래가 소비하는 램프
        구간의 적분값이 청구되며, 이는 시작점과 끝점의 한계 가격의 평균과 같습니다.
      </p>
      <div className="docs-definition-list">
        <div>
          <dt>bid 쪽, exact in</dt>
          <dd>
            <C>out = q · (2·maxBid·C − span·(2u + q)) / (2·C·10^exp)</C>, 내림이며{" "}
            <C>span = maxBid − minBid</C>입니다.
          </dd>
        </div>
        <div>
          <dt>ask 쪽, exact out</dt>
          <dd>
            <C>in = ⌈ q · (2·minAsk·C + span·(2u + q)) / (2·C·10^exp) ⌉</C>, 여기서{" "}
            <C>span = maxAsk − minAsk</C>입니다.
          </dd>
        </div>
        <div>
          <dt>나머지 두 방향</dt>
          <dd>
            같은 닫힌 형태를 대상으로 이진 탐색해 역산합니다. 먼저 양 끝점 가격으로 구간을 잡고 세 번
            더 좁히므로, 근사적으로가 아니라 정확히 일치합니다.
          </dd>
        </div>
        <div>
          <dt>반올림</dt>
          <dd>
            출력은 내림, 입력은 올림입니다. 모든 반올림 결정이 테이커에게 불리하고 풀에 유리한
            쪽으로, 한 단위씩 갑니다.
          </dd>
        </div>
      </div>
      <p>
        따라서 같은 네 개의 가격을 상대로 큰 거래는 작은 거래보다 나쁜 값을 받고, epoch이 절반쯤
        소진된 뒤 도착한 거래는 먼저 도착한 같은 거래보다 나쁜 값을 받습니다. Dubu PropAMM의 가격
        충격은 이것이 전부입니다. 여기에 리저브 비율은 들어 있지 않으므로, 충격의 크기는 컨트랙트에
        우연히 들어 있는 재고량이 아니라 메이커가 게시하기로 정한 깊이가 결정합니다.
      </p>
      <p>
        <C>executableTopBid</C>와 <C>executableTopAsk</C>는 현재 사용량에서의 한계 가격을 알려
        줍니다. 지금 도착한 테이커가 첫 단위에 받게 될 값입니다. 엔진은 저장된 끝점이 아니라 이 값을
        기준으로 드리프트를 잽니다.
      </p>
    </>
  ),

  capacity: () => (
    <>
      <h2>Capacity와 capacity epoch</h2>
      <p>
        capacity는 한쪽 방향의 램프가 소진되기 전까지 풀이 거래할 base의 양이고, 동시에 가격이 걸어갈
        때의 분모이기도 합니다. 거래로 다시 채워지는 것이 아니라 엔진이 새로 씁니다.
      </p>
      <p>
        epoch은 세대 카운터입니다. <C>refreshCapacity</C>는 새 매수, 매도 capacity를 쓰고 32비트{" "}
        <C>capGen</C>을 하나 올립니다. used 워드는 자기 <C>usedGen</C>을 따로 갖고 있고, 둘이
        어긋나면 <C>bidUsed</C>와 <C>askUsed</C>는 0으로 읽힙니다. 그래서 리프레시 한 번이 used
        워드를 전혀 건드리지 않고도 매수를 <C>maxBid</C>로, 매도를 <C>minAsk</C>로 되돌립니다.
      </p>
      <p>
        capacity는 호가의 나이에 따라 감쇠하기도 합니다. 페어에 0이 아닌 <C>decaySecs</C>가 설정되어
        있으면 풀이 채워 줄 크기는 <C>capacity · (decaySecs − age) / decaySecs</C>이고,{" "}
        <C>age ≥ decaySecs</C>에서 0이 됩니다. 여기서 <C>age</C>는 quote word 자신의{" "}
        <C>updatedAt</C>에서부터 잽니다. 이것은 데드맨 스위치입니다. 게시를 멈춘 엔진은 아무도
        개입하지 않아도 자기 책을 스스로 0까지 걸어 내립니다.
      </p>
      <p>
        감쇠는 가격이 아니라 크기에 상한을 겁니다. 커브는 여전히 저장된 <C>capacity</C> 전체를
        기준으로 계산되므로, 감쇠 중인 페어는 같은 클립에 더 나쁜 가격을 부르는 것이 아니라 더 작은
        최대 클립에 같은 가격을 부릅니다. staleness는 그와 별개이고 더 단호한 정지입니다.{" "}
        <C>age &gt; maxStaleSecs</C>가 되면 모든 뷰가 0을 반환하고, capacity가 무엇이라 하든{" "}
        <C>swap</C>은 <C>StaleQuote</C>로 되돌립니다.
      </p>
      <p>
        <C>snapshot(pairId)</C>는 그 전부를 반환합니다. 네 개의 가격, <C>updatedAt</C>, 두 capacity,
        두 사용량 카운터, 두 세대값, flags, <C>priceScaleExp</C>, <C>maxStaleSecs</C>입니다. 이 중
        플래그 두 개는 저장된 값이 아니라 호출자를 위해 합성됩니다. bit 15는 그 페어에 Pyth 피드가
        설정되어 있다는 뜻이고, bit 14는 0이 아닌 감쇠가 걸려 있다는 뜻입니다.{" "}
        <C>effectiveCapacity(pairId)</C>는 감쇠를 적용한 뒤의 숫자, 즉 풀이 지금 실제로 채워 줄 양을
        반환합니다.
      </p>
    </>
  ),

  guards: () => (
    <>
      <h2>가드와 역할</h2>
      <p>
        푸시된 가격은 신뢰된 가격이므로, 풀은 받아들일 값의 범위를 제한하고 그것을 쓸 수 있는 주체를
        나눕니다.
      </p>
      <div className="docs-definition-list">
        <div>
          <dt>기준가 범위</dt>
          <dd>
            페어에 Pyth 피드가 설정되어 있으면 <C>updateQuote</C>이 새 가격들을 그 피드와 대조합니다.{" "}
            <C>maxBid</C>가 기준가보다 <C>maxDeviationBps</C>를 넘게 위에 있으면{" "}
            <C>BidCeilingExceeded</C>로, <C>minAsk</C>가 그만큼 아래에 있으면{" "}
            <C>AskFloorBreached</C>로 되돌립니다. 피드를 읽을 수 없거나, 오래되었거나, 양수가 아니면
            통과시키지 않고 <C>ReferenceUnavailable</C>로 되돌립니다. 공정가가 일관되게 틀린 경우를
            잡아낼 수 있는 검사는 이것 하나뿐입니다. 엔진이 가격을 뽑아 오지 않는 소스에서 오기
            때문입니다.
          </dd>
        </div>
        <div>
          <dt>Quote word 유효성</dt>
          <dd>
            <C>minBid &lt; minPrice</C>이면 <C>BidBelowMinPrice</C>로 되돌립니다.{" "}
            <C>minBid ≤ maxBid ≤ minAsk ≤ maxAsk</C>를 깨는 값, 또는 <C>maxAsk</C>를{" "}
            <C>minBid</C>까지 끌어내리는 값은 <C>CrossedBook</C>으로 되돌립니다.
          </dd>
        </div>
        <div>
          <dt>리저브 하한</dt>
          <dd>
            나가는 토큰을 <C>minBaseReserve</C>나 <C>minQuoteReserve</C> 아래로 떨어뜨리는 체결은
            뷰에서 0으로 호가되고, <C>swap</C>에서는 <C>ReserveFloorBreached</C>로 되돌아갑니다.
          </dd>
        </div>
        <div>
          <dt>owner</dt>
          <dd>
            <C>addPair</C>, <C>withdraw</C>, <C>setPyth</C>, 그리고 나머지 세 역할의 교체입니다.
            소유권 이전은 2단계입니다.
          </dd>
        </div>
        <div>
          <dt>manager</dt>
          <dd>
            <C>setPairConfig</C>, <C>setPairDecay</C>, <C>setPairOracle</C>, <C>deposit</C>,{" "}
            <C>sync</C>입니다.
          </dd>
        </div>
        <div>
          <dt>updater</dt>
          <dd>
            <C>updateQuote</C>, <C>refreshCapacity</C>, <C>refreshCapacityBatch</C>입니다. 엔진의
            키이고, 핫 키입니다. 이 키가 새어 나갔을 때 피해를 한정하는 것이 위의 범위 제한들입니다.
          </dd>
        </div>
        <div>
          <dt>guardian</dt>
          <dd>
            페어 단위의 <C>pause</C>와 <C>unpause</C>, 책 전체의 <C>pauseAll</C>과{" "}
            <C>unpauseAll</C>입니다. 일시정지된 페어는 0을 호가하고 스왑할 수 없습니다.
          </dd>
        </div>
      </div>
      <p>
        역할을 나눈 것은 키가 서로 다른 곳에 있을 때에만 의미가 있습니다. 이 테스트넷 배포에서는 네
        역할이 모두 배포자입니다. 메인넷이라면 잘못되었을 유일한 지점이 이것입니다.
      </p>
    </>
  ),

  "quote-endpoint": () => (
    <>
      <div className="docs-section-heading">
        <div>
          <span lang="en">DUBU AGGREGATOR</span>
          <h2 lang="en">POST /quote</h2>
        </div>
      </div>
      <div className="docs-http" lang="en" translate="no">
        <span>POST</span>
        <code>{AGGREGATOR}/quote</code>
      </div>
      <p>
        거래 하나를 모든 venue에 걸쳐 호가하고, 이긴 쪽을 실행하는 calldata를 돌려줍니다. 읽기
        전용이고, 오리진 제한이 없으며, 캐시하지 않습니다. 호가의 수명이 블록 하나 정도이기
        때문입니다.
      </p>

      <div className="docs-definition-list">
        <div>
          <dt>tokenIn, tokenOut</dt>
          <dd>주소입니다. 상장된 마켓의 양쪽이어야 합니다. 둘의 순서가 방향을 정합니다.</dd>
        </div>
        <div>
          <dt>amountIn</dt>
          <dd>입력 토큰 자신의 최소 단위로 표기한 정수 문자열입니다. 양수여야 합니다.</dd>
        </div>
        <div>
          <dt>receiver</dt>
          <dd>
            <C>tokenOut</C>을 받을 주소입니다. calldata 안에 그대로 쓰이므로 필수입니다.
          </dd>
        </div>
        <div>
          <dt>slippageBps</dt>
          <dd>
            선택값이며 0에서 1000 사이의 정수입니다. 기본값은 50이고, <C>minAmountOut</C>을 정합니다.
          </dd>
        </div>
        <div>
          <dt>deadlineSecs</dt>
          <dd>선택값입니다. 지금부터 라우트가 만료될 때까지의 초이고, 기본값은 120입니다.</dd>
        </div>
      </div>

      <CodeBlock label="요청" code={quoteRequest} />
      <CodeBlock label="200, calldata 생략" code={quoteResponse} />

      <p>
        <C>route.to</C>와 <C>route.data</C>가 곧 트랜잭션입니다. 손대지 말고 그대로 보내십시오. 최소
        수령량, 수신자, 만료가 모두 그 안에 들어 있습니다. <C>approve.spender</C>는 RFQ를 포함한 모든
        라우트에서 Router입니다. <C>PmmSettle</C>이 테이커 레그를 <C>msg.sender</C>에서 끌어오는데,
        그것이 곧 Router가 자금을 넣어 준 어댑터이기 때문입니다. 대신 <C>PmmSettle</C>에 승인하면
        체결 시점에 리버트가 나고 트레이스에는 쓸 만한 것이 남지 않습니다.
      </p>
      <p>
        <C>detail</C>은 계산 과정을 그대로 보여 줍니다. 위 응답에서는 prop 풀이 UniV2 단독보다 46.3
        bps, 메이커의 서명된 주문보다 5.4 bps 더 지급했으므로 거래 전체를 가져갔고 <C>venues</C>는
        항목 하나입니다. <C>rfqMakerCanDeliver</C>는 메이커의 잔고와 <C>PmmSettle</C>에 대한 승인
        한도 중 작은 값입니다. 여기가 <C>null</C>이면 지급 여력 조회가 실패해서 그 축은 검증하지 못한
        채로 호가를 받아들였다는 뜻입니다. 검증했다는 것과는 다른 말이고, 그 자체로 문제는 아닙니다.
      </p>
    </>
  ),

  "markets-endpoint": () => (
    <>
      <div className="docs-section-heading">
        <div>
          <span lang="en">DUBU AGGREGATOR</span>
          <h2 lang="en">GET /markets</h2>
        </div>
      </div>
      <div className="docs-http" lang="en" translate="no">
        <span>GET</span>
        <code>{AGGREGATOR}/markets</code>
      </div>
      <p>
        이 서비스가 호가할 마켓 테이블입니다. 런타임에 알아내는 것이 아니라 워커에 컴파일해 넣습니다.
        자기 마켓을 네트워크 응답에서 배우는 애그리게이터는 공격자가 지정한 컨트랙트로 라우팅하기까지
        인젝션 한 번 거리이므로, 마켓을 추가하는 일은 곧 배포입니다. <C>rfq</C>는 RFQ 레그가 설정되어
        있는지를 알려 줍니다. <C>GET /health</C>는 <C>{"{ ok, chainId }"}</C>를 반환합니다.
      </p>
      <CodeBlock label="요청" code={marketsRequest} />
      <CodeBlock label="200, 일부 생략" code={marketsResponse} />
    </>
  ),

  errors: () => (
    <>
      <h2>오류 응답</h2>
      <p>
        사용자 눈에는 똑같아 보이지만 사실은 서로 다른 두 가지 실패가 있어서, 각각 다른 상태 코드로
        답합니다. 리프라이싱 때문에 한쪽을 거둬들인 경우는 수십 초 안에 저절로 돌아오므로 503으로
        답합니다. 나머지는 모두 404입니다. 이 서비스가 제시할 수 있는 주기로 재시도할 값어치가
        없기 때문입니다. 둘을 하나로 합치면 존재하지도 않는 페어에 대해서까지 프론트엔드가 같은
        메시지를 띄우게 되고, 테이커는 결국 묻기를 그만둡니다.
      </p>
      <CodeBlock label="어떤 venue도 체결하지 못함, 재시도 불가" code={errorNoVenue} />
      <CodeBlock label="일시적으로 리프라이싱 중, 재시도 가능" code={errorRepricing} />
      <CodeBlock label="목록에 없는 페어" code={errorNoMarket} />
      <div className="docs-definition-list">
        <div>
          <dt>400</dt>
          <dd>
            잘못된 본문, 잘못된 주소, 0 이하의 <C>amountIn</C>, 범위를 벗어난 <C>slippageBps</C>,
            또는 마켓이 없는 토큰 쌍입니다.
          </dd>
        </div>
        <div>
          <dt>404</dt>
          <dd>
            모든 venue가 0을 반환한 경우입니다. 소진된 epoch capacity, 오래된 quote word, 일시정지된
            페어, 또는 닿지 않는 엔진 가운데 하나입니다. 일시정지는 래치된 킬스위치일 수 있으므로,
            운영자 없이 풀린다고 볼 수 없습니다.
          </dd>
        </div>
        <div>
          <dt>500</dt>
          <dd>
            <C>could not build the route</C>. 경로는 정해졌는데 인코딩에 실패했습니다.
          </dd>
        </div>
        <div>
          <dt>502</dt>
          <dd>
            <C>could not read the chain</C>. 모든 RPC 엔드포인트가 실패했습니다.
          </dd>
        </div>
        <div>
          <dt>503</dt>
          <dd>
            <C>PropPool</C>이 리프라이싱을 하는 동안 이쪽 방향을 거둬들였고, 그 크기를 채워 줄 다른
            venue도 없었습니다. <C>retryable: true</C>가 함께 옵니다.
          </dd>
        </div>
      </div>
    </>
  ),

  markets: () => (
    <>
      <h2>마켓</h2>
      <p>
        아홉 개 페어이며 모두 mUSDC(소수점 6자리, <C>{TOKENS.mUSDC.address}</C>)를 상대로 호가됩니다.{" "}
        <C>pairId</C>는 풀 자신의 인덱스입니다. base 쪽 소수 자릿수는 페어마다 다르고, 하나를 틀리면
        아무것도 실패하지 않은 채로 자릿수 단위의 오차가 납니다.
      </p>
      <MarketsTable headers={KO_MARKET_HEADERS} />
      <p>
        아홉 개 중 두 개, mWETH/mUSDC와 mWBTC/mUSDC에는 UniswapV2 풀도 있고, 분할 라우트가 가능한
        페어는 이 둘뿐입니다. 나머지 일곱 개에서는 UniV2 레그가 0으로 호가되고, 거기에 조금이라도
        보내는 그리드 지점은 지급액이 0이라는 이유로 전부 탈락하며, prop에 전부 보내는 지점이 단독으로
        이깁니다. 풀이 실제로 있는 페어에서 UniV2가 죽었을 때도 같은 경로를 탑니다.
      </p>
    </>
  ),

  integrating: () => (
    <>
      <h2>연동하기</h2>
      <p>
        호출 두 번과 서명 한 번입니다. 호가를 받고, Router가 입력 토큰을 옮길 수 있는지 확인한 다음,
        애그리게이터가 준 것을 그대로 돌려보내십시오.
      </p>
      <CodeBlock label="호가와 실행, approve 경로" code={approvePath} />
      <div className="docs-callout">
        <span>◇</span>
        <div>
          <strong>서명 직전에 다시 호가하십시오</strong>
          <p>
            풀은 위에서 설명한 200 ms 주기로 가격을 다시 매기고 RFQ 주문은 짧은 만료로 서명됩니다. 몇 초 지난 호가는 값이
            어긋나는 정도가 아니라 리버트로 이어질 수 있습니다. 클릭 시점에 새로 받고, 이미 보여 준
            최소치보다 나쁘게 돌아오면 거절하십시오.
          </p>
        </div>
      </div>
    </>
  ),

  permit2: () => (
    <>
      <h2 lang="en">Permit2</h2>
      <p>
        Router는 두 진입점을 모두 받습니다. <C>swapExactIn</C>은 Router에 대한 상시 ERC-20 승인이
        필요합니다. <C>swapExactInWithPermit2</C>은 대신 서명된 <C>PermitTransferFrom</C>을 받아{" "}
        <C>{PERMIT2}</C>의 Permit2를 통해 끌어오므로, 상시 승인은 Permit2 자체에 대한 일회성 승인
        하나뿐입니다. Router는 끌어오기 전에 허가된 토큰이 <C>tokenIn</C>과 같은지, 허가된 수량이{" "}
        <C>amountIn</C>을 덮는지 확인하고, 잔고가 움직이지 않았으면 <C>PermitTransferredNothing</C>으로
        되돌립니다.
      </p>
      <p>
        애그리게이터는 <C>swapExactIn</C>으로 인코딩하므로, 이 경로는 돌려받은 calldata에서 라우트
        파라미터를 다시 디코딩해 Permit2 진입점에 맞춰 재인코딩합니다. 플랜 자체는 손대지 않습니다.
        이 점이 중요합니다. <C>minAmountOut</C>은 다시 계산하지 않고 디코딩한 값을 그대로 넘깁니다.
      </p>
      <CodeBlock label="호가와 실행, Permit2 경로" code={permit2Path} />
    </>
  ),

  "next-steps": () => (
    <>
      <h2>다음으로</h2>
      <div className="docs-next-grid">
        <Link href="/swap">
          <span>⇄</span>
          <div>
            <strong>스왑하기</strong>
            <p>트레이딩 화면을 엽니다.</p>
          </div>
          <b>→</b>
        </Link>
        <Link href="/trade">
          <span>⌁</span>
          <div>
            <strong>고급 거래 열기</strong>
            <p>차트, 지정가 주문, 실시간 풀 상태.</p>
          </div>
          <b>→</b>
        </Link>
      </div>
    </>
  ),
};
