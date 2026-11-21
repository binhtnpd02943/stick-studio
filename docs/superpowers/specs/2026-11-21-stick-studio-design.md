# Stick Studio — Thiết kế hệ thống

- Ngày: 2026-11-21
- Trạng thái: bản nháp chờ duyệt
- Ghi chú: mục nào ghi **[quyết định của Claude]** là đề xuất của người thiết kế, chưa được chủ dự án xác nhận riêng.

---

## 1. Mục đích và lý do

Stick Studio tự động sản xuất **phim ngắn người que hoạt hình** (dọc 9:16, 30–90 giây, giọng đọc AI tiếng Việt, phụ đề) để đăng TikTok.

- **Giai đoạn 1 (cá nhân):** chủ dự án dùng để sản xuất nội dung cho kênh TikTok của mình.
- **Giai đoạn 2 (startup):** mở cho người khác dùng như một SaaS nhiều người dùng.

Kiến trúc phải phục vụ giai đoạn 2 ngay từ đầu, để chuyển giai đoạn **không phải viết lại**, chỉ bật thêm phần (đăng nhập, thanh toán, chia tenant) và đưa worker lên hạ tầng server.

Nguồn cảm hứng và nền móng kỹ thuật: skill mã nguồn mở `nilbuild/stick-scene` (MIT, Kamran Ahmed). Skill này vẽ cảnh người que trên `<canvas>` bằng một runtime ~1.300 dòng không phụ thuộc thư viện, mỗi cảnh là **hàm thuần của thời gian** `draw(g, S)`, và có bộ kiểm tra chuyển động tự động (`motion.mjs`). Stick Studio fork runtime này (giữ thông báo bản quyền MIT) và mở rộng.

### Khác biệt so với stick-scene gốc

| stick-scene gốc | Stick Studio |
|---|---|
| Một cảnh đơn, 5–8 giây, khung ngang 380×230 | Phim nhiều cảnh 30–90 giây, khung dọc 1080×1920 |
| Không tiếng | Giọng AI theo nhân vật, phụ đề cháy chữ, nhạc nền |
| Coding agent viết code mỗi cảnh | LLM viết **kịch bản dàn dựng dạng dữ liệu (DSL)**, engine diễn bằng thư viện đã kiểm chứng |
| Chạy trong IDE của lập trình viên | Dây chuyền tự động, hàng đợi job, giao diện web |
| Nhúng web | Xuất MP4, đẩy lên TikTok |

---

## 2. Mục tiêu, không làm, phản mục tiêu

### Mục tiêu
1. **Chạy chuẩn và ổn định là ưu tiên số một.** Phim lên sóng chỉ dùng thành phần (hành động, đạo cụ, bối cảnh) đã kiểm chứng.
2. **Tự động hoá toàn bộ** từ chủ đề đến MP4. Con người chỉ có **một cổng duyệt** ở cuối (mức 2).
3. **Chế độ kể chuyện (A):** nhân vật người que diễn một câu chuyện hay đoạn phim nguyên bản, có thoại.
4. Kiến trúc nhiều người dùng sẵn sàng. Bản cá nhân chạy cùng codebase với một workspace duy nhất.
5. Kiểm soát chi phí: trần chi phí cho mỗi phim và mỗi ngày, ghi sổ chi phí từng bước.

### Thể loại
Chủ dự án không khoá thể loại: **"người que" chính là chủ đề của kênh**, nội dung tự do. Hệ quả **[quyết định của Claude]**:
- Thể loại là một cài đặt của kênh và của từng chủ đề (`genre`: `story` kể chuyện đời thường, hài, drama, ngụ ngôn | `explainer` giải thích kiến thức bằng câu chuyện). Mặc định để LLM tự chọn theo chủ đề.
- Prompt story và rubric QA tham số hoá theo `genre`. Với `explainer`, bật thêm bước tự kiểm tra kiến thức (LLM đối chiếu từng khẳng định, đánh dấu chỗ không chắc để người duyệt soi kỹ). Với `story`, rubric chấm nhịp, câu móc và twist.
- Thư viện khởi đầu chọn loại **dùng chung cho mọi thể loại** (mục 7.2).
- Bộ đánh giá nhỏ cho prompt gồm 5 chủ đề mẫu, phủ cả hai thể loại: "Một ngày đi làm của dân văn phòng", "Người que lần đầu đi phỏng vấn", "Lãi kép giải thích bằng quả cầu tuyết", "Vì sao không nên trì hoãn", "AI là gì, kể cho bà nghe".
- Sản lượng mặc định 1–2 phim/ngày, điều chỉnh bằng cài đặt kênh và trần chi phí.

### Không làm (đợt này)
- Chế độ làm lại từ video (B2: AI xem anime rồi diễn lại). Thiết kế chừa chỗ (`source_type`) nhưng không xây.
- Bắt chuyển động từ video (B1, pose estimation).
- Trình chỉnh sửa timeline kiểu CapCut. Người dùng chỉ duyệt hoặc làm lại kèm lý do, hoặc sửa văn bản kịch bản.
- Ứng dụng di động riêng. Giao diện web responsive là đủ, trang duyệt tối ưu cho điện thoại.
- Thanh toán, đăng ký công khai (giai đoạn 2).

### Phản mục tiêu (dù chạy được vẫn là thất bại)
- Đăng phim chưa được người duyệt (ở giai đoạn 1).
- Code do LLM viết chạy ngoài sandbox, hoặc lọt vào phim lên sóng mà chưa qua kiểm tra và duyệt.
- Dùng âm thanh, nhạc hoặc lời thoại có bản quyền.
- Chi phí chạy mất kiểm soát do vòng lặp sửa không có trần.
- Phim lặp lại, na ná nhau đến mức bị thuật toán TikTok coi là nội dung kém nguyên bản.

---

## 3. Ràng buộc

- **TikTok Content Posting API:** đăng thẳng công khai cần ứng dụng được TikTok duyệt. Trước khi được duyệt, dùng chế độ **upload vào hộp nháp (inbox)** của tài khoản, rồi người dùng bấm đăng trong app. Việc này trùng với cổng duyệt.
- **Tiếng Việt:** font phải hiển thị đủ dấu. Balsamiq Sans của bản gốc cần kiểm chứng. Nếu thiếu dấu thì thay bằng font viết tay có hỗ trợ tiếng Việt.
- **Giấy phép:** runtime gốc là MIT. Giữ `LICENSE` gốc trong `packages/engine`.
- **Máy chủ giai đoạn 1:** Mac của chủ dự án (đã có `ffmpeg`, Chrome, `whisper`). Docker cho Postgres và Redis.
- **Ngôn ngữ nội dung:** tiếng Việt là chính. Thiết kế không khoá cứng ngôn ngữ (`locale` trên kênh và phim).

---

## 4. Các cách đã cân nhắc

| Cách | Mô tả | Đánh đổi |
|---|---|---|
| 1. LLM viết code mỗi cảnh | Như skill gốc: mỗi cảnh một `scene.js` mới, tự kiểm tra và sửa | Sáng tạo nhất nhưng kém ổn định, đắt, chậm, nhân vật khó nhất quán |
| 2. DSL + engine | LLM chỉ viết kịch bản dàn dựng dạng JSON, engine diễn bằng thư viện có sẵn | Ổn định, rẻ, tất định, nhưng bị giới hạn trong thư viện |
| **3. Lai (đã chọn)** | Cách 2 làm chính. Khi thiếu hành động hay đạo cụ thì sinh **yêu cầu bổ sung thư viện**, LLM viết module theo quy trình skill gốc, qua kiểm tra và người duyệt rồi mới vào thư viện | Ổn định như cách 2, thư viện lớn dần theo nhu cầu thật và trở thành tài sản. Phức tạp hơn một chút |

Chủ dự án chọn cách 3 vì yêu cầu "chạy chuẩn nhất" và đồng ý với đề xuất.

**Quy tắc bất biến:** quá trình render phim **không bao giờ** chạy code chưa được duyệt. Khi thiếu thành phần, kịch bản được viết lại bằng các thành phần đã có. Yêu cầu bổ sung chạy song song, không chặn phim.

---

## 5. Kiến trúc tổng thể

```
                    ┌──────────────────────────────────────────────┐
  Trình duyệt ─────▶│ apps/web (Next.js)  — UI, duyệt trên điện thoại │
                    └───────────────┬──────────────────────────────┘
                                    │ REST + SSE (/v1)
                    ┌───────────────▼──────────────────────────────┐
                    │ apps/api (Fastify) — auth, validate, enqueue   │
                    └───────┬──────────────────────┬────────────────┘
                            │ SQL                  │ enqueue
                    ┌───────▼───────┐      ┌───────▼────────┐
                    │  PostgreSQL   │      │ Redis (BullMQ) │
                    └───────▲───────┘      └───────┬────────┘
                            │                      │ consume
                    ┌───────┴──────────────────────▼────────────────┐
                    │ apps/worker — các bước dây chuyền (stateless)  │
                    │  story → screenplay → validate → tts → align   │
                    │  → timeline → render → assemble → qa → publish │
                    └───┬──────────┬───────────┬───────────┬────────┘
                        │          │           │           │
                  LLM provider  TTS provider  Object storage  TikTok API
                  (Claude)      (adapter)     (S3 / local FS)

                    ┌───────────────────────────────────────────────┐
                    │ apps/workshop — xưởng thư viện (sandbox, không │
                    │ mạng): LLM viết action/prop mới → motion check │
                    │ → chờ người duyệt → publish vào thư viện       │
                    └───────────────────────────────────────────────┘
```

### Nguyên tắc
- **Mỗi bước dây chuyền là một job độc lập và idempotent.** Đầu vào và đầu ra là artifact trong object storage, trạng thái nằm trong Postgres. Chạy lại một bước cho cùng kết quả hoặc ghi đè an toàn. Mỗi bước sửa được và làm lại được riêng.
- **Worker không giữ trạng thái**, nên giai đoạn 2 nhân bản theo chiều ngang được: render là bước nặng CPU, tách thành hàng đợi riêng `render`.
- **Mọi nhà cung cấp bên ngoài đều qua adapter** (`LlmProvider`, `TtsProvider`, `StorageProvider`, `Publisher`). Đổi nhà cung cấp không ảnh hưởng nghiệp vụ. Test dùng adapter giả.
- **Engine dùng chung cho cả trình duyệt và server:** cùng một code vẽ cho bản xem trước trên web và render ra MP4.

### Công nghệ **[quyết định của Claude]**
| Lớp | Chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (Node 22 LTS) toàn bộ | Runtime gốc là JS, dùng chung type giữa web, api, worker và engine |
| Monorepo | pnpm workspaces | Đơn giản, đủ dùng. Thêm Turborepo khi build chậm |
| Web | Next.js (App Router) + Tailwind | Phổ biến, SSR cho trang công khai ở giai đoạn 2 |
| API | Fastify + zod (sinh OpenAPI từ schema) | Nhanh, schema-first, sau này public API dễ |
| DB | PostgreSQL 16 + Drizzle ORM | Quan hệ rõ, migration bằng SQL, type-safe |
| Hàng đợi | Redis + BullMQ | Retry, backoff, ưu tiên, hàng đợi riêng cho render |
| Storage | S3-compatible. Giai đoạn 1: adapter filesystem cục bộ | Đổi sang S3/R2 bằng cấu hình |
| LLM | Claude API, mặc định `claude-sonnet-5-5` cho truyện và dàn dựng, `claude-opus-5-5` cho xưởng thư viện | Dùng prompt caching cho system prompt dài (DSL spec, catalog thư viện) |
| TTS | Adapter. Ứng viên tiếng Việt: Azure Neural (vi-VN), Google Cloud TTS, FPT.AI, ElevenLabs. **Chọn sau spike nghe thử** | Chất lượng giọng là cảm nhận chủ quan, cần chủ dự án nghe |
| Căn phụ đề | whisper (cục bộ) forced alignment trên audio TTS | Không phụ thuộc nhà cung cấp TTS có trả về timestamp hay không |
| Render | Engine chạy trong Node với `@napi-rs/canvas` (không cần trình duyệt), đẩy khung thô vào `ffmpeg` qua pipe | Nhanh hơn nhiều so với chụp màn hình trình duyệt. **Cần spike xác nhận** chữ và nét vẽ giống trình duyệt. Dự phòng: Playwright + `STICK.at()` |
| Ghép video | ffmpeg: nối, trộn audio (giảm âm lượng nhạc khi có thoại), phụ đề ASS cháy chữ | Chuẩn, miễn phí |
| Log | pino (JSON), request-id/run-id xuyên suốt | Truy vết một phim qua các bước |

---

## 6. Dây chuyền sản xuất

```
topic ─▶ [1 story] ─▶ [2 screenplay] ─▶ [3 validate⟲repair] ─▶ [4 tts] ─▶ [5 align]
      ─▶ [6 timeline] ─▶ [7 render] ─▶ [8 assemble] ─▶ [9 qa] ─▶ [10 review] ─▶ [11 publish]
                              │
                 thiếu action/prop ─▶ library_request ─▶ workshop (song song, không chặn)
```

| # | Bước | Đầu vào → đầu ra | Ghi chú |
|---|---|---|---|
| 1 | **story** | chủ đề + cài đặt kênh → `story.json` (tiêu đề, logline, danh sách cảnh, thoại theo nhân vật, câu móc 3 giây đầu) | LLM. Cấu trúc TikTok: móc → diễn biến → cao trào/twist → kết |
| 2 | **screenplay** | story + catalog thư viện + cast → `screenplay.json` (DSL, mục 7) | LLM, structured output theo JSON Schema sinh từ zod. Catalog thư viện nằm trong system prompt (cache) |
| 3 | **validate ⟲ repair** | screenplay → screenplay hợp lệ | Kiểm tra cú pháp (zod) + ngữ nghĩa (mục 7.3). Lỗi → gửi danh sách lỗi cho LLM sửa, **tối đa 3 vòng**. Hành động không tồn tại → tạo `library_request` + yêu cầu LLM thay bằng hành động có sẵn |
| 4 | **tts** | từng câu thoại → file audio | Giọng theo nhân vật. Cache theo hash(text, voice, provider) để làm lại không tốn tiền |
| 5 | **align** | audio + văn bản → timestamp từng từ | whisper. Dùng cho phụ đề và nhịp miệng/cử chỉ |
| 6 | **timeline** | screenplay + độ dài audio thật → `timeline.json` tuyệt đối (giây) | **Tất định, không LLM.** Thoại quyết định độ dài beat. Hành động co giãn trong khoảng cho phép của thư viện |
| 7 | **render** | timeline → các đoạn MP4 không tiếng theo cảnh | Hàng đợi `render` riêng. Render song song theo cảnh. Engine tất định: cùng timeline → cùng khung hình |
| 8 | **assemble** | đoạn hình + audio + phụ đề + nhạc → `final.mp4` + `cover.jpg` | ffmpeg. Phụ đề an toàn theo vùng UI của TikTok (tránh mép dưới và cột phải) |
| 9 | **qa** | final + timeline → `qa_report.json` + điểm | Kiểm tra tự động: (a) motion check (từ `motion.mjs`) trên khung hình đã render, (b) contact sheet → LLM vision chấm "có đọc hiểu được không" và đối chiếu kịch bản, (c) kỹ thuật: thời lượng, âm lượng LUFS, độ phân giải, phụ đề không tràn. Lỗi nặng → tự làm lại từ bước phù hợp (giới hạn số lần) |
| 10 | **review** | phim → duyệt / làm lại (kèm lý do, chọn bước làm lại) | Cổng người. `review_policy` của kênh: `manual` (giai đoạn 1) hoặc `auto_if_score>=X` |
| 11 | **publish** | phim đã duyệt → TikTok | Giai đoạn 1: upload vào hộp nháp. Sau khi app được duyệt: đăng thẳng theo lịch |

### Chống lặp nội dung **[quyết định của Claude]**
Cơ chế nhẹ ở P1, không dùng embedding: bước gợi ý chủ đề và bước story nhận danh sách tiêu đề, logline, bối cảnh và nhân vật của khoảng 30 phim gần nhất trong kênh, kèm yêu cầu tránh trùng. Bước validate cảnh báo nếu tiêu đề quá giống phim cũ (so khớp chuỗi đơn giản). Nâng lên embedding khi số phim đủ lớn.

### Nhạc và hiệu ứng âm thanh **[quyết định của Claude]**
- P1: nhạc nền **không bắt buộc**. Thư mục `assets/music/` kèm `LICENSE.json` ghi nguồn và giấy phép từng file. Chủ dự án tự đưa nhạc có giấy phép rõ (CC0 hoặc đã mua) vào thư mục này. Hệ thống không tự tải nhạc.
- Vì phim được đẩy vào hộp nháp TikTok, chủ dự án có thể gắn nhạc từ thư viện âm thanh của TikTok lúc bấm đăng. Đây là đường an toàn bản quyền nhất.
- SFX đơn giản (bước chân, "pop", "ting") lấy từ bộ CC0, cũng ghi vào `LICENSE.json`.

### Kiểm soát lỗi và chi phí
- Mỗi bước: retry tối đa 3 lần với backoff mũ cho lỗi tạm thời (mạng, 429, 5xx). Lỗi logic không retry mà chuyển `failed` kèm lý do.
- **Sổ chi phí** (`usage_events`): mỗi lần gọi LLM hoặc TTS ghi token, ký tự, giây, chi phí ước tính.
- **Trần chi phí:** `max_cost_per_film` và `max_cost_per_day` theo workspace. Vượt trần → dừng phim ở trạng thái `blocked_budget`, không âm thầm bỏ qua.
- Hủy phim: đánh dấu `cancelled`, worker kiểm tra cờ trước mỗi bước.

---

## 7. Engine và DSL dàn dựng

### 7.1 Engine (`packages/engine`)
Fork `runtime/stick.js`, tách thành module ES, **không phụ thuộc DOM** ở lõi:

- `rig/`: bộ xương, IK, pose, `mix`, easing, walk (giữ nguyên thuật toán gốc).
- `kit/`: bút vẽ và đạo cụ cơ bản (giữ nguyên).
- `stage/`: lớp vẽ khung, nhận `CanvasRenderingContext2D`-compatible (trình duyệt hoặc `@napi-rs/canvas`).
- `element/`: `<stick-scene>` cho trình duyệt (xem trước, nhúng web).
- **Mới:**
  - `camera`: pan, zoom, theo nhân vật.
  - `backdrop`: phông nền theo bộ (phòng, lớp học, đường phố, văn phòng, công viên…).
  - `character`: nhân vật có danh tính (màu mực, phụ kiện: tóc, mũ, kính, nơ) + biểu cảm qua tư thế.
  - `director`: nhận `timeline.json`, tại thời điểm `t` tính pose của từng nhân vật bằng cách trộn các action đang chạy, rồi gọi vẽ. **Đây là thay thế cho `draw(g,S)` viết tay của bản gốc.**
  - `vertical layout`: khung 9:16. Sân khấu ở giữa, vùng tiêu đề phía trên, vùng phụ đề phía dưới.

### 7.2 Thư viện (`packages/library`)
Mỗi thành phần là một module có metadata, có version:

```ts
// Hành động: hàm thuần (pose hiện tại, tham số, tiến độ k 0..1) → pose mới (+ đạo cụ vẽ thêm)
interface ActionDef {
  id: 'walk_to' | 'point_at' | 'give' | 'sit' | 'cheer' | string;
  version: number;
  params: ZodSchema;              // ví dụ { target: Mark | CharacterRef }
  duration: { min: number; ideal: number; max: number };  // giây, timeline co giãn trong khoảng này
  roles: number;                  // số nhân vật tham gia (give = 2)
  apply(ctx, k): void;            // tất định
  preview: string;                // đường dẫn ảnh/GIF minh hoạ cho catalog
  description: string;            // một dòng, đưa vào catalog cho LLM
}
```

Tương tự: `PropDef` (đạo cụ), `BackdropDef` (bối cảnh), `EmotionDef` (biểu cảm qua tư thế).
Thư viện khởi đầu **[quyết định của Claude]**: khoảng 30 action (đi, chạy, đứng nghĩ, chỉ, vẫy, gật, lắc đầu, ngồi, đứng dậy, cầm/đặt, đưa/nhận, ném/bắt, ôm, đẩy, ngã, nhảy, ăn mừng, khóc, giận dậm chân, gõ máy tính, đọc sách, nói điện thoại…), khoảng 20 đạo cụ đời thường (bàn, ghế, laptop, điện thoại, cốc, sách, bảng, cửa, túi, hộp, đồng hồ…), 8 bối cảnh dùng chung (nhà, văn phòng, lớp học, đường phố, công viên, quán cà phê, sân khấu trống, nền trắng có bảng để giải thích). Port từ các cảnh có sẵn trong repo gốc khi có thể.

### 7.3 DSL kịch bản dàn dựng (rút gọn)

```jsonc
{
  "version": 1,
  "format": { "aspect": "9:16", "fps": 30 },
  "cast": [
    { "id": "minh", "name": "Minh", "look": { "ink": "#141414", "hair": "short" }, "voice": "male_young" },
    { "id": "lan",  "name": "Lan",  "look": { "ink": "#d97757", "hair": "ponytail" }, "voice": "female_young" }
  ],
  "scenes": [
    {
      "id": "s1",
      "backdrop": "classroom",
      "props": [{ "id": "board", "type": "whiteboard", "mark": "right" }],
      "start": { "minh": "left", "lan": "center" },
      "beats": [
        { "say": { "who": "minh", "text": "Lan ơi, phân số là gì vậy?" },
          "do":  [{ "who": "minh", "action": "scratch_head" }] },
        { "do":  [{ "who": "lan", "action": "walk_to", "target": "board" },
                  { "who": "lan", "action": "point_at", "target": "board" }],
          "say": { "who": "lan", "text": "Nhìn cái bánh pizza này nhé." },
          "camera": { "zoom": 1.3, "focus": "board" } }
      ]
    }
  ]
}
```

- Vị trí dùng **mark có tên** (`left`, `center`, `right`, `near:<prop>`), không dùng toạ độ thô. LLM không cần biết hình học.
- **Kiểm tra ngữ nghĩa** (bước 3): action, prop, backdrop tồn tại đúng version; tham số hợp lệ; nhân vật đến được mục tiêu (tầm với ~37 đơn vị, phải `walk_to` trước); không quá N nhân vật một khung; thoại không quá dài cho một beat; tổng thời lượng ước tính trong khoảng của kênh; không trùng vị trí hai nhân vật.

### 7.4 Xưởng thư viện (`apps/workshop`)
1. Nhận `library_request` (ví dụ "đạp xe", kèm ngữ cảnh kịch bản đã yêu cầu nó).
2. LLM (Opus) viết module theo quy trình và `craft.md` của skill gốc, dùng các script frames/motion đã chuyển sang chạy được với engine.
3. Vòng tự kiểm tra: motion check sạch + contact sheet → LLM tự nhìn → sửa (tối đa 5 vòng).
4. Trạng thái `pending_review` → người duyệt xem GIF xem trước → `approved`, version mới vào thư viện.
5. **Bảo mật:** code LLM viết chỉ chạy trong **container riêng, không mạng, giới hạn CPU, RAM, thời gian**, mount chỉ thư mục làm việc. Module được duyệt lưu như artifact có version (giai đoạn 1 có thể commit vào repo). Engine render chỉ nạp module `approved`.
6. **Hạn chế định dạng module [quyết định của Claude]:** duyệt bằng GIF không đủ để tin code. Vì vậy module thư viện bị giới hạn ở dạng **hàm thuần**: không `import`/`require`, không truy cập global (`process`, `globalThis`, `fetch`, `eval`, `Function`…), chỉ dùng API engine được truyền vào qua tham số. Kiểm tra bằng **AST allowlist + lint** trước khi vào `pending_review`, và kiểm tra lại khi nạp. Màn duyệt hiện cả GIF lẫn diff code. Ngoài ra, bước render chạy trong **child process không có biến môi trường bí mật và không mạng**, để kể cả module lọt lưới cũng không lấy được gì.

---

## 8. Lược đồ cơ sở dữ liệu (PostgreSQL)

Mọi bảng nghiệp vụ có `workspace_id` (đa tenant). Giai đoạn 1 seed **một** workspace và **một** user. Khoá chính `uuid` (v7, sắp xếp được theo thời gian). Có `created_at`, `updated_at`.

```sql
-- Danh tính & tenant
users            (id, email UNIQUE, name, created_at)
workspaces       (id, name, plan TEXT DEFAULT 'personal',
                  max_cost_per_film_usd NUMERIC, max_cost_per_day_usd NUMERIC, created_at)
workspace_members(workspace_id FK, user_id FK, role TEXT CHECK (role IN ('owner','editor','viewer')),
                  PRIMARY KEY (workspace_id, user_id))
api_tokens       (id, workspace_id FK, user_id FK, name, token_hash UNIQUE, last_used_at, revoked_at)

-- Kênh phát hành
channels         (id, workspace_id FK, platform TEXT CHECK (platform IN ('tiktok')),
                  display_name, locale TEXT DEFAULT 'vi-VN',
                  review_policy TEXT CHECK (review_policy IN ('manual','auto_if_score')) DEFAULT 'manual',
                  auto_score_threshold NUMERIC,
                  target_duration_sec INT4RANGE,      -- ví dụ [30,90]
                  style JSONB,                        -- màu thương hiệu, font, nhạc nền mặc định
                  oauth_credentials_encrypted BYTEA,  -- token TikTok, mã hoá bằng khoá từ env
                  created_at)

-- Dàn nhân vật dùng lại qua nhiều phim
characters       (id, workspace_id FK, name, look JSONB, voice_id TEXT, description, archived_at)

-- Hàng đợi ý tưởng
topics           (id, workspace_id FK, channel_id FK, title, brief TEXT,
                  source TEXT CHECK (source IN ('manual','suggested')),
                  status TEXT CHECK (status IN ('proposed','approved','rejected','used')),
                  created_at)

-- Phim
films            (id, workspace_id FK, channel_id FK, topic_id FK NULL,
                  source_type TEXT CHECK (source_type IN ('story','remake')) DEFAULT 'story',
                  title, status TEXT,   -- queued|running|qa_failed|awaiting_review|approved|
                                        -- publishing|published|failed|cancelled|blocked_budget
                  current_version INT, qa_score NUMERIC, cost_usd NUMERIC DEFAULT 0,
                  created_by FK users, created_at)
film_versions    (id, film_id FK, version INT, parent_version INT NULL,
                  reason TEXT,          -- 'initial' | lý do làm lại
                  restart_from_step TEXT, UNIQUE (film_id, version))

-- Từng bước dây chuyền
step_runs        (id, film_version_id FK, step TEXT, attempt INT,
                  status TEXT CHECK (status IN ('pending','running','succeeded','failed','skipped')),
                  input_hash TEXT,      -- idempotency: cùng input_hash + succeeded → bỏ qua
                  error JSONB, started_at, finished_at,
                  UNIQUE (film_version_id, step, attempt))
assets           (id, workspace_id FK, film_version_id FK NULL,
                  kind TEXT,            -- story|screenplay|timeline|audio|segment|final|cover|qa_report|contact_sheet
                  storage_key TEXT, mime, bytes BIGINT, sha256, meta JSONB, created_at)

-- Duyệt & phát hành
reviews          (id, film_version_id FK, reviewer_id FK users,
                  decision TEXT CHECK (decision IN ('approved','redo')),
                  reason TEXT, redo_from_step TEXT NULL, created_at)
publications     (id, film_id FK, channel_id FK, mode TEXT CHECK (mode IN ('inbox_draft','direct')),
                  status TEXT, scheduled_at, published_at, external_id, error JSONB)

-- Thư viện
library_items    (id, workspace_id FK NULL,   -- NULL = thư viện chung của hệ thống
                  kind TEXT CHECK (kind IN ('action','prop','backdrop','emotion')),
                  key TEXT, version INT,
                  status TEXT CHECK (status IN ('draft','pending_review','approved','deprecated')),
                  meta JSONB, module_asset_id FK assets, preview_asset_id FK assets,
                  UNIQUE (workspace_id, kind, key, version))
library_requests (id, workspace_id FK, kind, key_suggestion, description,
                  requested_by_film_id FK NULL, status TEXT, result_item_id FK NULL, created_at)

-- Chi phí & kiểm toán
usage_events     (id, workspace_id FK, film_version_id FK NULL, step TEXT,
                  provider TEXT, model TEXT, units JSONB, cost_usd NUMERIC, created_at)
audit_log        (id, workspace_id FK, actor_id FK NULL, action TEXT, target TEXT, data JSONB, created_at)
```

Chỉ mục chính: `films(workspace_id, status, created_at DESC)`, `step_runs(film_version_id, step)`, `usage_events(workspace_id, created_at)`, `topics(workspace_id, status)`.

---

## 9. API (REST, tiền tố `/v1`)

- Auth **[quyết định của Claude]**: ngay từ P1 làm **session cookie** (đăng nhập email + mật khẩu băm argon2, cookie `HttpOnly; Secure; SameSite=Lax`, CSRF token cho request ghi) cho web, và `Authorization: Bearer <api_token>` cho CLI/API. Giai đoạn 2 chỉ thêm đăng ký công khai + OAuth Google, không viết lại auth.
- Truy cập từ điện thoại ở giai đoạn 1 **[quyết định của Claude]**: Tailscale (mạng riêng giữa Mac và điện thoại, không mở cổng ra Internet). OAuth TikTok cần HTTPS công khai: xử lý ở P3 bằng tunnel có tên miền cố định (Cloudflare Tunnel) hoặc deploy API lên cloud.
- Phản hồi thống nhất: `{ "data": ..., "error": null, "meta": { ... } }`. Lỗi: `{ "data": null, "error": { "code", "message", "details" } }`.
- Danh sách dùng phân trang con trỏ: `?limit=&cursor=`.
- Mọi body validate bằng zod. OpenAPI sinh tự động ở `/v1/openapi.json`.
- Rate limit theo token (giai đoạn 2 theo gói).
- Request tạo job nhận header `Idempotency-Key`.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/v1/me` | user + workspace hiện tại |
| GET/PATCH | `/v1/workspace` | cài đặt, trần chi phí |
| GET/POST | `/v1/channels` | danh sách / tạo kênh |
| GET/PATCH | `/v1/channels/:id` | cài đặt kênh, `review_policy` |
| POST | `/v1/channels/:id/tiktok/connect` | bắt đầu OAuth TikTok → URL |
| GET | `/v1/channels/:id/tiktok/callback` | callback OAuth |
| GET/POST | `/v1/characters` · PATCH/DELETE `/v1/characters/:id` | dàn nhân vật |
| GET | `/v1/topics?status=` | hàng đợi ý tưởng |
| POST | `/v1/topics` | thêm ý tưởng thủ công |
| POST | `/v1/topics/suggest` | LLM gợi ý một lô ý tưởng cho kênh |
| POST | `/v1/topics/batch-decision` | duyệt/loại nhiều ý tưởng một lần; duyệt có thể kèm `produce: true` |
| POST | `/v1/films` | tạo phim từ `topic_id` hoặc `{title, brief}` → enqueue |
| GET | `/v1/films?status=&channel_id=` | danh sách phim |
| GET | `/v1/films/:id` | chi tiết: version hiện tại, các bước, assets, chi phí |
| GET | `/v1/films/:id/events` | SSE: tiến độ từng bước theo thời gian thực |
| PATCH | `/v1/films/:id/screenplay` | sửa văn bản kịch bản hoặc thoại → version mới, chạy lại từ bước 3 |
| POST | `/v1/films/:id/redo` | `{ from_step, reason }` → version mới |
| POST | `/v1/films/:id/cancel` | hủy |
| POST | `/v1/films/:id/review` | `{ decision: approved|redo, reason?, redo_from_step? }` |
| POST | `/v1/films/:id/publish` | `{ channel_id, mode, scheduled_at? }` |
| GET | `/v1/assets/:id/url` | URL ký có thời hạn để xem hoặc tải |
| GET | `/v1/review-queue` | phim chờ duyệt (tối ưu cho điện thoại) |
| GET | `/v1/library?kind=` | catalog thư viện (đã duyệt) kèm preview |
| GET | `/v1/library/requests` · POST `/v1/library/requests/:id/decision` | yêu cầu bổ sung, duyệt module mới |
| GET | `/v1/usage?from=&to=` | chi phí theo ngày, phim, nhà cung cấp |
| GET | `/healthz`, `/readyz` | kiểm tra sống (DB, Redis) |

---

## 10. Kiến trúc giao diện (`apps/web`)

Next.js App Router. Server Components cho trang danh sách, Client Components cho player và SSE. Gọi API qua một client có type, sinh từ OpenAPI. Không dùng thư viện quản lý state toàn cục: TanStack Query cho dữ liệu server.

| Trang | Đường dẫn | Nội dung |
|---|---|---|
| Tổng quan | `/` | phim đang chạy (tiến độ từng bước), chờ duyệt, chi phí hôm nay so với trần |
| Ý tưởng | `/topics` | danh sách đề xuất, chọn nhiều → duyệt và sản xuất; nút "gợi ý thêm" |
| Phim | `/films` | lọc theo trạng thái |
| Chi tiết phim | `/films/[id]` | player MP4; thanh các bước (trạng thái, thời gian, chi phí, log lỗi); tab kịch bản (story, thoại, sửa được); tab QA (contact sheet, điểm, cảnh báo); lịch sử version; làm lại từ bước X |
| **Duyệt** | `/review` | **mobile-first:** video toàn màn hình dọc, hai nút lớn Duyệt / Làm lại, chọn lý do nhanh (sai kiến thức, cảnh khó hiểu, giọng, nhịp, khác), vuốt sang phim tiếp |
| Dàn nhân vật | `/cast` | nhân vật, xem trước bằng engine trong trình duyệt, nghe thử giọng |
| Thư viện | `/library` | lưới action/prop/backdrop có preview động (engine chạy trực tiếp); tab yêu cầu đang chờ duyệt |
| Cài đặt | `/settings` | kênh, kết nối TikTok, chính sách duyệt, trần chi phí, giọng mặc định, phong cách |

Thành phần dùng chung: `<FilmPlayer>`, `<StepTimeline>`, `<ScenePreview>` (bọc `<stick-scene>` từ engine), `<CostBadge>`, `<ReviewCard>`.

---

## 11. Cấu trúc thư mục

```
stick-studio/
├── apps/
│   ├── api/                 # Fastify: routes/, plugins/ (auth, errors, rate-limit), openapi
│   ├── worker/              # BullMQ consumers: steps/<step>.ts, queues.ts, budget.ts
│   ├── workshop/            # xưởng thư viện, chạy trong container sandbox
│   └── web/                 # Next.js: app/, components/, lib/api-client.ts
├── packages/
│   ├── core/                # domain: types, zod schemas (DSL, API), trạng thái phim, lỗi
│   ├── db/                  # Drizzle schema, migrations/, repositories/, seed.ts
│   ├── engine/              # fork runtime: rig/ kit/ stage/ camera/ character/ director/ element/  (LICENSE MIT gốc)
│   ├── library/             # actions/ props/ backdrops/ emotions/ + catalog.ts
│   ├── pipeline/            # logic thuần từng bước: story, screenplay, validate, timeline, assemble, qa
│   ├── providers/           # llm/ (claude, fake) tts/ (adapter, fake) storage/ (fs, s3) publisher/ (tiktok, fake)
│   ├── render/              # node-canvas renderer → ffmpeg pipe; motion-check; contact-sheet
│   └── prompts/             # system prompt có version: story, screenplay, repair, qa-vision, workshop
├── infra/
│   ├── docker-compose.yml   # postgres, redis (giai đoạn 1); + api, worker, web (giai đoạn 2)
│   └── Dockerfile.*         # api, worker (kèm ffmpeg, font), workshop (không mạng)
├── assets/                  # font (có dấu tiếng Việt), nhạc nền bản quyền sạch, SFX
├── docs/                    # thiết kế, ADR, runbook
├── scripts/                 # CLI: seed, tạo token, chạy một phim từ dòng lệnh
└── .env.example
```

Luật phụ thuộc: `apps/*` → `packages/*`; `pipeline` không import `providers` cụ thể, chỉ dùng interface trong `core`; `engine` không import gì của dự án.

---

## 12. Bảo mật

- Secret (Claude key, TTS key, khoá mã hoá token TikTok) chỉ đọc từ env. Kiểm tra đủ khi khởi động, thiếu thì dừng.
- Token API lưu dạng hash (SHA-256). Token OAuth TikTok mã hoá AES-GCM.
- Code LLM viết chỉ chạy trong xưởng sandbox (mục 7.4). Render chỉ nạp module đã duyệt.
- Văn bản người dùng nhập (chủ đề, brief) được coi là dữ liệu trong prompt, có ranh giới rõ, không ghép vào system prompt.
- Lọc nội dung đầu ra: LLM tự kiểm tra an toàn nội dung ở bước story (bạo lực, thù ghét, thông tin sai lệch nguy hiểm), cộng thêm cổng người duyệt.
- Giai đoạn 2: phân quyền theo `workspace_members.role`, mọi truy vấn lọc `workspace_id` ở lớp repository.

## 13. Kiểm thử

- Unit: validate DSL, timeline solver, tính chi phí, chuyển trạng thái phim.
- Engine: **golden frame tests**, render khung ở các thời điểm cố định rồi so pixel với ảnh chuẩn (cho phép sai số nhỏ). Mỗi action trong thư viện phải qua motion check sạch trong CI.
- Integration: API + Postgres thật (testcontainers).
- E2E dây chuyền: chủ đề → MP4 với provider giả (LLM trả kịch bản mẫu, TTS sinh tiếng im lặng có độ dài xác định). Kiểm tra file MP4 đúng thời lượng và độ phân giải.
- Độ phủ mục tiêu: 80% cho `core`, `pipeline`, `db`.

## 14. Lộ trình

| Giai đoạn | Nội dung | Kết quả kiểm chứng |
|---|---|---|
| **P0: Spike (bỏ đi sau khi học xong)** | Render một phim 2 cảnh từ DSL viết tay bằng engine trên Node canvas → MP4 dọc; kiểm tra font tiếng Việt; tạo mẫu giọng từ 2–3 nhà cung cấp TTS để chủ dự án nghe | Tốc độ render, chất lượng nét, chọn được TTS |
| **P1: Lõi cá nhân** | engine + thư viện khởi đầu + pipeline 1–9 + DB + API + worker + web (đăng nhập, tổng quan, chi tiết phim, duyệt) + CLI. Thiếu thành phần thì **chỉ ghi `library_request`** và viết lại kịch bản bằng thành phần có sẵn; chưa có xưởng | Chủ dự án gõ chủ đề → nhận MP4 đạt chất lượng đăng được |
| **P2: Ý tưởng & thư viện** | gợi ý chủ đề theo lô, xưởng thư viện + duyệt module | Thư viện tự lớn lên theo yêu cầu thật |
| **P3: Phát hành** | OAuth TikTok, upload hộp nháp, lên lịch; nộp đơn xin duyệt ứng dụng TikTok | Phim duyệt xong tự vào hộp nháp TikTok |
| **P4: Mở cho người khác** | đăng ký/đăng nhập, nhiều workspace, gói và thanh toán, giới hạn theo gói, deploy server (worker render tách máy), giám sát | Người ngoài dùng được |
| **P5: Chế độ làm lại (B2)** | `source_type='remake'`: video → AI vision mô tả shot → story/screenplay → cùng dây chuyền | Kèm điều khoản sử dụng và quy trình gỡ nội dung |

## 15. Để lại cho người xây
- Chi tiết thuật toán timeline solver (co giãn action trong khoảng `duration`, chèn khoảng nghỉ giữa các câu thoại).
- Bố cục chính xác của khung 9:16 (vị trí vùng an toàn, cỡ chữ phụ đề) theo thử nghiệm thực tế.
- Prompt cụ thể cho từng bước (đặt trong `packages/prompts`, có version, có bộ đánh giá nhỏ).
- Danh sách chính xác của thư viện khởi đầu, ưu tiên port từ các cảnh có sẵn ở repo gốc.
- Chọn thư viện UI component (shadcn/ui hoặc tương đương).
