
![](/blogs/shopify-app-integration/28b443cfe0d23a89.webp)

基于“已有 Shopify 独立站，尚未接入 App”的现状分析。

适用对象：产品、开发、UI、运营、财务、法务/合规、相关负责人。

> **阅读结论：** 当前优先接入现有 Shopify 独立站，不建议现阶段在 App 内自研完整跨境电商系统。App 重点做商城入口、账号弱绑定、订单回传、物流/保修展示、耗材复购推荐；Shopify 继续负责商品、购物车、支付、订单、税费和后台运营。

说明：文中费用与周期为项目评估区间，实际以服务商报价、销售国家、商品认证范围、物流模式和税务方案为准。

---

![](/blogs/shopify-app-integration/44f1ee0d5f86054e.webp)

## 01｜先看结论

现在已经有 Shopify 独立站，下一步不是重新做一个商城，而是把现有 Shopify 接入 App。当前阶段建议采用“轻接入 + 订单回传”方式，先跑通购买闭环。

| 判断 | 方案 | 周期 | 费用 | 说明 |
| --- | --- | --- | --- | --- |
| 当前推荐 | 接入现有 Shopify 独立站 | 2-4 周 | 约 0.8-6 万 RMB | 先让用户能从 App 进入商城，下单后订单能回传到 App 后台 |
| 暂不推荐 | App 内完整自研电商 | 2-6 个月起 | 约 20-120 万 RMB 起 | 会占用前后端、支付、税务、物流、合规资源，影响 App 主链路交付 |
| 后期可选 | 原生商城 + Shopify 结账 | 6-10 周+ | 约 8-20 万 RMB | App 做原生商品浏览，付款仍跳 Shopify Checkout |
| 中长期可评估 | 完全自研跨境电商系统 | 8-12 个月+ | 约 150-300 万 RMB+ | 仅在订单规模稳定、团队成熟、合规预算充足后再启动 |

**当前判断：先补连接层，不重做交易层。**

---

## 02｜现状与目标

已有独立站说明交易基础已经存在，App 当前要解决的是入口、账号、订单、物流、保修和复购的连接问题。

### 2.1｜当前现状

| 类别 | 现状 | 影响 |
| --- | --- | --- |
| 已有基础 | 已存在 Shopify 独立站 | 商品、订单、支付、后台运营基础已具备，不需要从 0 开发商城 |
| 当前缺口 | Shopify 尚未接入 App | App 内无法自然承接购买、耗材复购、保修关联、订单查询 |
| 业务问题 | 交易和 App 主链路割裂 | 用户在 App 内完成打印体验后，购买耗材/配件要离开 App，复购路径长 |
| 数据问题 | App 用户与 Shopify 订单未打通 | 无法判断某个 App 用户是否购买过设备、耗材、配件，也无法做售后保修关联 |
| 推进判断 | 先补连接层，不重做交易层 | 把 App 作为入口和服务承接层，Shopify 继续承担交易系统 |

### 2.2｜职责边界

| 角色 | 职责边界 |
| --- | --- |
| App 负责 | 商城入口、登录态、设备 SN、打印场景、耗材推荐、订单展示、物流展示、保修承接、售后入口 |
| Shopify 负责 | 商品、购物车、结账、支付、优惠码、订单、退款、税费配置、基础库存、营销插件、后台运营 |
| App 后台负责 | 用户绑定、shopify_customer_id、shopify_order_id、Webhook 接收、订单状态映射、保修/设备关联 |
| 不建议当前做 | App 内重做完整购物车、结账、支付、税务、退款、风控、跨境清关逻辑 |

目标链路：

> **App 首页/我的/耗材入口 → Shopify 商品页或集合页 → 下单支付 → Shopify Webhook → App 后台 → App 内订单/物流/保修/耗材复购**

---

## 03｜接入 Shopify

推荐顺序是先 L1，再 L2；L3 根据 App 首发后转化数据决定。账号层不建议一开始追求完全统一，先让订单、保修和售后能闭环。

### 3.1｜接入层级

| 层级 | 做法 | 开发内容 | 周期 | 费用 | 建议 |
| --- | --- | --- | --- | --- | --- |
| L1 轻入口 | App 内按钮打开 Shopify H5 或系统浏览器 | 商品页/集合页链接、返回 App、加载失败页、外部浏览器兜底 | 1-2 周 | 约 0.8-2 万 RMB | 首发推荐，最快解决“App 内有商城入口” |
| L2 订单回传 | Shopify Webhook 同步订单到 App 后台 | Webhook、签名校验、订单表、状态映射、email/user_id 绑定、物流单号展示 | 2-4 周 | 约 2-6 万 RMB | 强烈建议，形成订单/保修/售后闭环 |
| L3 原生商品层 | App 原生展示商品，结账仍跳 Shopify checkoutUrl | Storefront API、商品缓存、购物车、优惠码、跳转结账、异常处理 | 6-10 周 | 约 8-20 万 RMB | 后期优化体验，不建议压首发 |
| L4 深度账号层 | Customer Account API / OIDC / 新客户账号 | OAuth 2.0 + PKCE、客户 token、受保护客户数据权限申请、订单查询 | 10-16 周 | 约 15-40 万 RMB | 技术复杂度明显上升，后期再评估 |

### 3.2｜账号打通

| 方案 | 说明 | 周期 | 费用 | 判断 | 风险/限制 |
| --- | --- | --- | --- | --- | --- |
| 方案 A：邮箱/手机号弱绑定 | App 用户登录后，用 email/phone/coupon/referral_code 与 Shopify 订单匹配 | 1-3 周 | 约 1-4 万 RMB | 首发推荐 | 准确率依赖用户填写；但成本低、风险小、上线快 |
| 方案 B：查询顾客资料订单接口 Shopify Customer Account API | 用 OAuth 2.0 + PKCE 登录客户账号，并读取客户/订单数据 | 6-12 周 | 约 8-25 万 RMB+；接口费用 0 元，不另行收费 | 后期可做 | 需要处理 token、回调、受保护客户数据权限、账号体验一致性 |
| 方案 C：商城免登录 Multipass SSO | App/自有系统登录后免登录进入 Shopify | 6-10 周+ | 开发接入费约 3-8 万 RMB + Shopify Plus 官方报价约 20 万/年 | 不建议当前做 | 依赖 Shopify Plus，且与新旧客户账号体系相关；前期投入不划算 |

> **补充判断：** 当前建议：不要先追求“完全统一账号”。先做 App user_id + email + shopify_customer_id + shopify_order_id 的弱绑定即可，能满足订单、保修、售后和复购。

### 3.3｜H5 放进 App

| 问题 | 涉及内容 | 建议做法 | 风险 |
| --- | --- | --- | --- |
| 打开方式 | WebView / Safari View Controller / Chrome Custom Tabs / 外部浏览器 | 结账页建议优先系统浏览器或 SFSafariViewController/Custom Tabs | PayPal、3DS、Apple Pay、Google Pay 在 WebView 内可能体验不稳定 |
| 返回 App | 支付成功页、失败页、取消页、Deep Link 回 App | 必须做成功/失败/取消三种回跳兜底 | 否则用户付款后不知道是否成功，客服压力上升 |
| 登录状态 | App 已登录，Shopify H5 可能仍未登录 | 首发允许弱绑定，订单用 email/coupon/user_id 映射 | 强行 SSO 会增加周期和不可控风险 |
| 加载体验 | 弱网、白屏、超时、证书异常、页面加载失败 | App 内必须有加载、失败、重试、外部打开 | 不能只放一个 WebView 空白页 |
| 支付边界 | 实体商品可用 Shopify/信用卡/PayPal；数字内容需按 Apple/Google 规则处理 | 打印机、耗材、配件走 Shopify；AI 点数/会员/数字素材不要混进 Shopify 购物车 | 混卖数字权益可能触发 App 审核问题 |

### 3.4｜订单回传字段

| 字段类别 | 建议字段 |
| --- | --- |
| 基础字段 | shopify_order_id、shopify_customer_id、email、phone、total_price、currency、financial_status、fulfillment_status |
| App 绑定字段 | app_user_id、device_sn、coupon_code、utm_source、referral_code、landing_page、source_name |
| 物流字段 | tracking_company、tracking_number、tracking_url、fulfillment_time、delivery_status |
| 售后字段 | refund_status、cancelled_at、return_status、warranty_start_at、warranty_end_at |
| 安全字段 | Webhook HMAC 签名校验、幂等处理、重试日志、失败告警、手动补偿入口 |

### 3.5｜订单状态与异常

| 状态组 | 状态枚举 | UI/后台表现 |
| --- | --- | --- |
| 订单创建 | 待支付 / 已支付 / 支付失败 / 已取消 | 订单页展示状态，失败可继续付款或重新下单 |
| 订单履约 | 待发货 / 部分发货 / 已发货 / 已签收 | 展示物流号、物流公司、更新时间 |
| 退款售后 | 退款中 / 已退款 / 退款失败 / 拒付争议 | 售后入口、客服邮箱、拒付证据归档 |
| 同步异常 | Webhook 失败 / 重复推送 / 数据缺字段 / 绑定失败 | 后台告警 + 手动补偿，不能只依赖自动同步 |

### 3.6｜Shopify 费用与限制

| 费用项 | 费用/范围 | 说明 | 限制/风险 |
| --- | --- | --- | --- |
| Shopify 基础套餐 | Basic $29/月、Grow $79/月、Advanced $299/月，按年付价格；Plus $2,300/月起 | 已建站则多为存量成本；若要 Plus 再评估 | 官方价格会按地区、币种、计划变化；需以后台为准 |
| 第三方支付交易费 | 使用第三方支付时，Basic 2%、Grow 1%、Advanced 0.6% | 若用 Shopify Payments 可避免 Shopify 第三方交易费，但仍有卡组织/支付处理费 | 支付费直接影响毛利 |
| Shopify Payments HK | 香港可用；支持信用/借记卡、Apple Pay、Google Pay、Shop Pay，部分本地支付按买家地区展示 | 需香港主体、银行账户、KYC/业务资料 | 资料不一致可能审核失败或要求补件 |
| 插件成本 | 评论、物流追踪、税费、翻译、多币种、邮件、客服、发票等 | 约 $0-300/月；复杂站点可能更高 | 插件越多，页面速度和兼容风险越高 |
| App 接入开发费 | L1 约 0.8-2 万 RMB；L2 约 2-6 万 RMB；L3 约 8-20 万 RMB | 按外包/内部成本估算 | 越早做原生商城，越容易拖慢 App 主链路 |

---

## 04｜App 自研商城

自研商城不建议作为当前阶段主方案。它不是加一个页面，而是要重新承担支付、订单、税务、物流、售后和多国合规。

### 4.1｜自研范围

| 阶段 | 功能范围 | 周期 | 费用 | 判断 |
| --- | --- | --- | --- | --- |
| P0：能卖货 | 商品列表、详情、购物车、下单、地址、运费、Stripe/PayPal、支付回调、订单、退款、后台订单、邮件通知、物流单号 | 2-3 个月 | 约 20-50 万 RMB | 只能做到基础可卖，跨境税费/清关/风控仍弱 |
| P1：可运营 | 多币种、多语言、优惠码、库存、地址校验、物流轨迹、税费预估、发票、订单导出、风控、弃单、售后工单 | 4-6 个月 | 约 60-120 万 RMB | 开始接近可持续运营，但维护成本明显上升 |
| P2：平台化 | 多仓、DDP 关税预收、VAT/GST 自动计算、ERP/WMS、会员积分、KOC 分销、评论、邮件自动化、订阅耗材、B2B 价格 | 8-12 个月+ | 约 150-300 万 RMB+ | 接近小型电商平台，需要长期团队维护 |

> **补充判断：** 不建议当前阶段自研完整跨境电商。当前主链路仍是“选图 → 编辑 → 连接 → 打印 → 出图”，自研商城会把团队拖到支付、税务、物流、清关、售后、拒付和多国合规。

### 4.2｜资料与资质

| 类别 | 资料/资质 | 说明 | 获得周期 | 费用 |
| --- | --- | --- | --- | --- |
| 公司主体 | 香港公司注册证书、商业登记证、董事/UBO、注册地址、银行账户、公司网站、业务说明 | 已有则整理即可；缺资料会影响支付/KYC | 1-2 周 | 补件/翻译/公证约 0-1 万 RMB |
| 支付资料 | Stripe/PayPal/Shopify Payments 商户资料、结算银行、退款负责人、拒付证据模板 | 自研必须接 PSP；Shopify 可直接用现有支付配置 | 1-4 周 | 支付费约 2.5%-5%+固定费；拒付另计 |
| 商品资料 | SKU、英文名、卖点、材质、重量、尺寸、原产地、包装、图片、适配机型、保修规则 | Shopify 和自研都必须完善 | 3-10 天 | 内部整理为主；摄影/设计另计 |
| 清关资料 | HS Code、申报品名、申报价值、原产地、商业发票、装箱单、DDP/DAP 规则 | 影响关税、清关、拒收率 | 1-3 周 | 顾问/物流商确认约 0.2-2 万 RMB |
| 产品认证 | FCC、CE、RoHS、REACH、UKCA、RCM、WEEE/电池/适配器相关要求，按销售市场确认 | 硬件跨境销售重点，不是网站功能能解决 | 2-8 周+ | 常见约 1-10 万 RMB+，按测试项目和实验室报价 |
| 税务资料 | VAT/IOSS、UK VAT、AU GST、CA GST/HST、美国销售税 nexus 评估 | 按销售国家和订单规模触发 | 2-12 周 | 税务代理/申报约 0.5-10 万 RMB/年+ |
| 政策文件 | 隐私政策、用户协议、退款政策、发货政策、保修政策、Cookie 政策、数据删除说明 | 自研更需要完整；Shopify 也要挂站 | 1-3 周 | 模板低成本；法务审阅约 0.5-5 万 RMB |
| 运营资料 | 客服邮箱、售后 SLA、退货地址、拒付证据、FAQ、物流异常话术、保修登记流程 | 影响实际售后成本 | 1-2 周 | 内部为主；客服工具约 $0-200/月 |

### 4.3｜周期与费用

| 成本项 | 内容 | 费用区间 | 周期 | 风险 |
| --- | --- | --- | --- | --- |
| 一次性开发 | 前端 Flutter、后台 Vue、后端 Java、支付、订单、商品、库存、退款、物流、邮件、后台权限 | P0 20-50 万；P1 60-120 万；P2 150-300 万 RMB+ | 2-12 个月+ | 不含后续税务、合规、运营维护 |
| 持续人力 | 1 前端 + 1 后端 + 0.5 测试 + 0.5 UI + 0.5 产品/运营 | 约 7-10 万 RMB/月 | 持续 | 上线后仍要维护支付、退款、风控、物流异常 |
| 服务器运维 | 服务器、CDN、数据库、日志、监控、备份、WAF、安全扫描 | 约 0.3-2 万 RMB/月 | 持续 | 交易系统对安全和稳定性要求高 |
| 支付成本 | Stripe/PayPal/信用卡处理费、跨境卡、换汇、拒付、争议 | 约 2.5%-5%+固定费；拒付/争议另计 | 持续 | 支付费省不掉，自研也要付 |
| 合规税务 | VAT/GST/IOSS/销售税、税务顾问、申报、年审、政策更新 | 约 0.5-20 万 RMB/年+ | 持续 | 市场越多，成本越高 |
| 物流清关 | 物流系统、DDP/DAP、关税预估、商业发票、轨迹回传、退货地址 | 系统 $0-300/月+；关税/派送按单计 | 持续 | 美国/EU 政策变化会直接影响成本 |
| 法务政策 | 协议、隐私、Cookie、售后政策、多语种、消费者权益 | 约 0.5-5 万 RMB/次；高要求更高 | 1-4 周 | 上线后变更也要更新 |

---

## 05｜主要市场要求

以下费用/周期为常见项目评估区间，不等于固定报价。具体取决于销售国家、商品品类、物流模式、是否 DDP、是否使用本地仓、是否涉及无线/电池/电源适配器/液体/带磁。

| 市场 | 主要要求 | 难解决环节 | 相关费用 | 获得周期 | 对 Shopify / 自研影响 |
| --- | --- | --- | --- | --- | --- |
| 美国 | 低值包裹免税政策已变化；需关注关税、HS Code、清关、销售税 nexus、FCC/无线认证 | 难点：关税不再按“低值免税”简单处理；物流小包成本和清关责任上升；蓝牙/无线硬件需要 FCC 相关授权 | 税务评估：约 0.5-3 万 RMB/次<br>销售税工具：约 $20-300/月+<br>FCC/测试：约 1-6 万 RMB+<br>DDP/关税：按 HS Code 和订单计 | 税务/物流方案：1-4 周<br>FCC/测试：2-8 周<br>销售税注册：2-8 周 | Shopify：可先卖，但要把税费/物流方案讲清楚<br>自研：必须自建税费、清关、地址、拒付和申报逻辑，难度高 |
| 欧盟 | VAT/IOSS、GPSR 欧盟责任人、CE/RoHS/REACH/WEEE、标签/说明书/产品安全资料 | 难点：非欧盟卖家通常需要 IOSS 中介或税务代理；GPSR 要有欧盟责任人；硬件还涉及 CE/RoHS/WEEE | IOSS：约 €100-500/月，设置费另计<br>GPSR 责任人：约 €150-500/年起，复杂产品更高<br>CE/RoHS/REACH/WEEE：约 1-10 万 RMB+<br>翻译/标签：约 0.3-3 万 RMB | IOSS/VAT：2-8 周<br>GPSR：2-6 周<br>CE/测试：2-8 周+<br>完整资料：4-12 周 | Shopify：适合先用插件/税务服务处理<br>自研：税费、责任人、标签、文件保存、售后召回都要自己维护 |
| 英国 | £135 以下境外直销商品通常需在销售点处理 VAT；可能涉及 UK VAT、UKCA、WEEE、退货地址 | 难点：非英国主体 VAT 判断复杂；若使用英国仓或本地库存，义务更重 | UK VAT 注册/代理：约 £300-1,500 设置费<br>申报：约 £50-300/月或/次<br>UKCA/WEEE：按产品另报价，约 1-8 万 RMB+ | VAT 注册：4-10 周<br>产品合规：2-8 周<br>物流方案：1-4 周 | Shopify：可先通过税务配置/代理处理<br>自研：必须在下单页处理 VAT、发票、申报和退货流程 |
| 澳洲 | 低值进口商品（A$1,000 及以下）可能适用 GST；年销售额触发后需注册/申报；电子产品可能涉及 RCM | 难点：GST 是否触发要看澳洲销售额和业务模式；如果走本地仓，要求更高 | GST 注册本身可免费<br>税务代理/ABN+GST 服务：约 AUD 450 起<br>RCM/测试：约 1-8 万 RMB+<br>申报服务：约 AUD 100-500/次 | GST/ABN：约 1-3 周<br>RCM/测试：2-8 周<br>物流方案：1-3 周 | Shopify：先按订单规模评估 GST<br>自研：需要自己判断税率、发票、申报和阈值 |
| 加拿大 | GST/HST 取决于是否在加拿大经营、销售规模、供货方式；无线产品可能涉及 ISED | 难点：是否构成“在加拿大经营”需要税务判断；省级 HST/PST 也要关注 | GST/HST 注册/代理：约 CAD 500-2,000<br>申报服务：约 CAD 100-500/次<br>ISED/产品测试：约 1-8 万 RMB+ | 税务判断/注册：2-8 周<br>产品合规：2-8 周<br>物流方案：1-4 周 | Shopify：可先限制市场或低频测试<br>自研：跨省税务和申报逻辑不适合前期自建 |
| 香港 | 商业登记、公司主体展示、隐私政策、商品说明条例、线上交易宣传真实性 | 难点：公司主体、收款主体、网站主体要一致；商品参数、宣传图、功效说明不能误导 | 主体资料整理：低成本<br>政策/协议审阅：约 0.5-3 万 RMB<br>隐私/数据流程梳理：约 0.3-2 万 RMB | 资料整理：1-2 周<br>政策文件：1-3 周<br>合规审阅：1-4 周 | Shopify：继续作为交易主体承接即可<br>自研：需额外承担支付安全、隐私、交易记录、退款和消费者投诉处理 |

---

## 06｜推进计划

优先推进 L1 和 L2。第 6 周后，再根据点击率、加购率、支付成功率、订单量和客服问题判断是否做 L3。

### 6.1｜实施节奏

| 阶段 | 动作 | 交付物 | 负责人 |
| --- | --- | --- | --- |
| 第 0 周：资料核对 | 确认 Shopify 当前套餐、支付方式、商品分类、结账页、政策页、物流方式、税费配置、后台权限 | Shopify 账号权限、商品 URL、集合 URL、支付/物流截图、政策页 | 产品 + 运营 + 财务 |
| 第 1-2 周：L1 接入 | App 增加商城入口；打开 Shopify H5/系统浏览器；补加载、失败、重试、外部打开、返回 App | 可运行 App 包；商城入口可用；异常状态可验证 | Flutter + UI + 测试 |
| 第 2-4 周：L2 回传 | 开发 Webhook、订单同步、用户弱绑定、订单状态映射、物流展示、保修关联 | App 后台订单表；App 订单页；Webhook 日志；失败补偿入口 | 后端 + Flutter + 测试 |
| 第 4-6 周：运营闭环 | 补耗材复购、设备 SN 绑定、KOC 优惠码、邮件/客服、退款/售后话术 | 复购入口；保修规则；售后 SOP；运营看板 | 产品 + 运营 + 后台 |
| 第 6 周后：是否 L3 | 根据点击率、加购率、支付成功率、订单量、客服问题决定是否做 App 原生商品层 | L3 立项评估表；预算；排期 | 相关负责人 |

### 6.2｜什么时候启动自研商城

| 判断项 | 启动条件 | 当前建议 |
| --- | --- | --- |
| 订单规模 | 月订单量稳定，Shopify 插件/交易/运营成本明显影响毛利 | 未达到前，不建议自研 |
| 团队能力 | 至少有稳定 Flutter、Java 后端、后台前端、测试、运维能力 | 没有内部技术闭环，不建议自研交易系统 |
| 合规预算 | 能承担 VAT/GST/销售税、支付、隐私、产品合规、税务代理长期成本 | 没有预算，不建议拓展多市场自营交易 |
| 业务差异 | Shopify 无法满足会员、耗材订阅、设备绑定、分销、售后等深度业务 | 如只是卖货，不需要自研 |
| 风险承受 | 能接受支付冻结、拒付、税费错误、清关失败、数据安全事故的运维压力 | 当前阶段不建议把这些风险转到 App 团队 |

**收束判断：当前阶段不建议把支付冻结、拒付、税费错误、清关失败和数据安全事故的运维压力转到 App 团队。**

---

## 来源 URL（英文标题 + 中文译文）

以下来源用于支撑文档中的平台规则、支付边界、税务/合规要求。英文标题保留原文，并增加中文说明，便于内部评审阅读。

| 编号 | English Title | 中文译文/用途 | 来源 URL |
| --- | --- | --- | --- |
| S01 | Shopify Pricing - Setup and Open Your Online Store Today | Shopify 价格方案与第三方支付交易费说明 | https://www.shopify.com/pricing |
| S02 | Shopify Payments for Hong Kong SAR | Shopify 香港收款支持与资料要求说明 | https://help.shopify.com/en/manual/payments/shopify-payments/supported-countries/hong-kong |
| S03 | Customer payment methods with Shopify Payments in Hong Kong SAR | Shopify 香港可用支付方式说明 | https://help.shopify.com/en/manual/payments/shopify-payments/supported-countries/hong-kong/payment-methods |
| S04 | Authenticate customers with the Customer Account API | Shopify Customer Account API 登录认证说明 | https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/authenticate-customers |
| S05 | Work with protected customer data | Shopify 受保护客户数据权限申请说明 | https://shopify.dev/docs/apps/launch/protected-customer-data |
| S06 | Cart - Storefront API | Shopify Storefront API 购物车与 checkoutUrl 说明 | https://shopify.dev/docs/api/storefront/latest/objects/Cart |
| S07 | App Review Guidelines | Apple App 审核规则，涉及外部购买、实体商品与数字内容边界 | https://developer.apple.com/app-store/review/guidelines/ |
| S08 | Understanding Google Play’s Payments policy | Google Play 支付政策，数字商品必须使用 Google Play Billing 的规则说明 | https://support.google.com/googleplay/android-developer/answer/10281818?hl=en |
| S09 | Google Play's billing system | Google Play Billing 仅用于数字商品，实体商品需使用其他支付方式 | https://developer.android.com/google/play/billing |
| S10 | E-Commerce Frequently Asked Questions | 美国 CBP 跨境电商与低值包裹关税规则 FAQ | https://www.cbp.gov/trade/basic-import-export/e-commerce/faqs |
| S11 | VAT e-Commerce - One Stop Shop | 欧盟 VAT/IOSS 与低值进口商品 VAT 说明 | https://vat-one-stop-shop.ec.europa.eu/index_en |
| S12 | EU's General Product Safety Regulation (GPSR): A New Era of Consumer Protection | 欧盟 GPSR 产品安全与欧盟责任人要求说明 | https://trade.ec.europa.eu/access-to-markets/en/news/eus-general-product-safety-regulation-gpsr-new-era-consumer-protection |
| S13 | VAT and overseas goods sold directly to customers in the UK | 英国境外直销商品 VAT 规则说明 | https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk |
| S14 | GST on low value imported goods | 澳洲低值进口商品 GST 规则说明 | https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/gst-on-low-value-imported-goods |
| S15 | Doing Business in Canada - GST/HST Information for Non-Residents | 加拿大非居民经营 GST/HST 规则说明 | https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4027/doing-business-canada-gst-hst-information-non-residents.html |
| S16 | Business Registration - Inland Revenue Department | 香港商业登记相关说明 | https://www.ird.gov.hk/eng/tax/bre.htm |
| S17 | Trade Descriptions | 香港商品说明条例与网上销售宣传真实性要求 | https://www.customs.gov.hk/en/service-enforcement-information/consumer-protection/trade-desc/index.html |
| S18 | Equipment Authorization - FCC | 美国 FCC 设备授权要求说明 | https://www.fcc.gov/engineering-technology/laboratory-division/general/equipment-authorization |
| S19 | RoHS Directive - European Commission | 欧盟 RoHS 有害物质限制要求说明 | https://environment.ec.europa.eu/topics/waste-and-recycling/rohs-directive_en |
