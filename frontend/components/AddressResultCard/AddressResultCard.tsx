'use client';

import type { ReactNode } from 'react';
import ResultCard from '@/components/ResultCard/ResultCard';
import RiskBadge from '@/components/RiskBadge/RiskBadge';
import CopyButton from '@/components/CopyButton/CopyButton';
import SourceBreakdown from '@/components/SourceBreakdown/SourceBreakdown';
import type { AddressCheckResponse } from '@/lib/types';
import { toUppercaseRiskLevel } from '@/lib/types';
import styles from './AddressResultCard.module.css';

interface AddressResultCardProps {
  result: AddressCheckResponse;
}

function isPositiveNumber(n: number | undefined): boolean {
  return n !== undefined && Number.isFinite(n) && n > 0;
}

function LabelWithHint({ title, hint }: { title: string; hint: string }) {
  return (
    <span className={styles.labelStack}>
      <span className={styles.labelTitle}>{title}</span>
      <span className={styles.labelHint}>{hint}</span>
    </span>
  );
}

function KvRow({ label, labelHint, value }: { label: string; labelHint: string; value: ReactNode }) {
  return (
    <div className={styles.kvRow}>
      <span className={styles.kvLabel}>
        <span className={styles.kvLabelTitle}>{label}</span>
        <span className={styles.kvLabelHint}>{labelHint}</span>
      </span>
      <span className={styles.kvValue}>{value}</span>
    </div>
  );
}

function ThWithHint({ title, hint }: { title: string; hint: string }) {
  return (
    <th>
      <span className={styles.thStack}>
        <span className={styles.thTitle}>{title}</span>
        <span className={styles.thHint}>{hint}</span>
      </span>
    </th>
  );
}

export default function AddressResultCard({ result }: AddressResultCardProps) {
  const { metadata } = result;
  const stablecoinIncoming =
    metadata.stablecoinIncomingVolume ?? metadata.totalIncomingVolume;

  const hasTaintData =
    isPositiveNumber(metadata.taintPercent) ||
    isPositiveNumber(stablecoinIncoming) ||
    isPositiveNumber(metadata.riskyIncomingVolume);

  return (
    <ResultCard title="Результат">
      <div className={styles.resultGrid}>
        {result.address && (
          <div className={styles.resultItem}>
            <LabelWithHint
              title="Адрес кошелька"
              hint="TRON-адрес (Base58), по которому выполнялась проверка. Скопируйте для сверки в обозревателе блокчейна."
            />
            <div className={styles.addressRow}>
              <code className={styles.address}>{result.address}</code>
              <CopyButton text={result.address} />
            </div>
          </div>
        )}
        <div className={styles.resultItem}>
          <LabelWithHint
            title="Итоговая оценка риска"
            hint="Число от 0 до 100: совокупный AML-скоринг (базовый риск, заражённость притока стейблкоинами, поведение, объём и учёт доверенных контрагентов)."
          />
          <span className={styles.value}>{result.riskScore}</span>
        </div>
        <div className={styles.resultItem}>
          <LabelWithHint
            title="Уровень риска"
            hint="Грубая категория (низкий / средний / высокий и т.д.), выведенная из итоговой оценки для быстрого восприятия."
          />
          <RiskBadge level={toUppercaseRiskLevel(result.riskLevel)} />
        </div>
        {metadata.addressSecurity?.riskLevel && (
          <div className={styles.resultItem}>
            <LabelWithHint
              title="Безопасность адреса"
              hint="Дополнительный сигнал из внешних метаданных (например, TronScan): фишинг, взлом контракта и подобные маркеры, если они известны для адреса."
            />
            <span className={styles.value}>{metadata.addressSecurity.riskLevel}</span>
          </div>
        )}
        {result.flags.length > 0 && (
          <div className={styles.resultItem}>
            <LabelWithHint
              title="Флаги модели"
              hint="Отдельные эвристики и условия, сработавшие при анализе (например, необычный профиль транзакций). Помогают понять, за что «доначислен» риск."
            />
            <div className={styles.flags}>
              {result.flags.map((flag, idx) => (
                <span key={idx} className={styles.flag}>
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}
        {metadata.isBlacklisted && (
          <div className={styles.resultItem}>
            <LabelWithHint
              title="Чёрный список"
              hint="Адрес присутствует во внутренней базе рисковых или связанных с ними кошельков (прямое попадание или известная связь с сидом)."
            />
            <span className={styles.warning}>Да</span>
          </div>
        )}
        {hasTaintData && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Заражённость по USDT / USDC</span>
            <span className={styles.sectionDesc}>
              Оценка притока стейблкоинов: доля и объём, пришедшие с адресов, помеченных как рисковые. Считается по входящим TRC-20 переводам USDT/USDC, а не по
              общему списку транзакций.
            </span>
            {metadata.stablecoinSofWarning && (
              <div className={styles.hint}>{metadata.stablecoinSofWarning}</div>
            )}
            <div className={styles.kvGrid}>
              {isPositiveNumber(metadata.taintPercent) && (
                <KvRow
                  label="Доля заражённого притока"
                  labelHint="Процент входящего объёма USDT/USDC, отнесённого к рисковым источникам (взвешенно по уверенности и глубине связи)."
                  value={<strong>{metadata.taintPercent!.toFixed(1)}%</strong>}
                />
              )}
              {isPositiveNumber(stablecoinIncoming) && (
                <KvRow
                  label="Входящий объём стейблкоинов"
                  labelHint="Сумма входящих USDT и USDC по контрактам (в условных единицах токена), по которой строится анализ источника средств."
                  value={<strong>{stablecoinIncoming!.toFixed(2)}</strong>}
                />
              )}
              {isPositiveNumber(metadata.riskyIncomingVolume) && (
                <KvRow
                  label="Объём с рисковых адресов"
                  labelHint="Часть входящего стейблкоин-объёма, атрибутированная контрагентам с повышенным риском по модели."
                  value={<strong>{metadata.riskyIncomingVolume!.toFixed(2)}</strong>}
                />
              )}
            </div>
          </div>
        )}

        {metadata.explanation && metadata.explanation.length > 0 && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Пояснение к оценке</span>
            <span className={styles.sectionDesc}>
              Краткие формулировки на человеческом языке: что в основном повлияло на балл (приток, контрагенты, поведение, белый список и т.д.).
            </span>
            <ul className={styles.explanationList}>
              {metadata.explanation.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {metadata.scoreBreakdown && (
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Разбивка итоговой оценки</span>
            <span className={styles.sectionDesc}>
              Вклад отдельных компонентов скоринга до и после учёта доверенных бирж и платёжных адресов. Сумма строк не обязана совпадать с итогом из-за
              нелинейного смешивания и ограничений шкалы.
            </span>
            <div className={`${styles.kvGrid} ${styles.kvGridWithRowSeparators}`}>
              <KvRow
                label="Базовый риск"
                labelHint="Стартовый балл из чёрного списка, меток и прямых сигналов по адресу до графа притока."
                value={<strong>{metadata.scoreBreakdown.baseRiskScore.toFixed(1)}</strong>}
              />
              {Math.abs(metadata.scoreBreakdown.taintScore) > 1e-9 && (
                <KvRow
                  label="Заражённость (скоринг)"
                  labelHint="Вклад доли рискового стейблкоин-притока в итоговую оценку (отдельно от сырого процента заражённости)."
                  value={<strong>{metadata.scoreBreakdown.taintScore.toFixed(1)}</strong>}
                />
              )}
              <KvRow
                label="Поведение"
                labelHint="Паттерны по транзакциям: частота, фан-ин/фан-аут, типичность для биржи или кастодиального кошелька и т.п."
                value={<strong>{metadata.scoreBreakdown.behavioralScore.toFixed(1)}</strong>}
              />
              <KvRow
                label="Объём"
                labelHint="Корректировка с учётом масштаба движения средств относительно типичных порогов."
                value={<strong>{metadata.scoreBreakdown.volumeScore.toFixed(1)}</strong>}
              />
              <KvRow
                label="До белого списка"
                labelHint="Промежуточная сумма компонентов перед снижением за счёт известных доверенных контрагентов."
                value={<strong>{metadata.scoreBreakdown.preWhitelistScore.toFixed(1)}</strong>}
              />
              <KvRow
                label="После белого списка"
                labelHint="Оценка после учёта притока с бирж и адресов из сильного белого списка (смягчение ложноположительных сценариев)."
                value={<strong>{metadata.scoreBreakdown.postWhitelistScore.toFixed(1)}</strong>}
              />
              {metadata.scoreBreakdown.whitelistLevel && (
                <KvRow
                  label="Уровень белого списка"
                  labelHint="Насколько сильно сработало подавление риска за счёт доверенного/биржевого притока."
                  value={<strong>{metadata.scoreBreakdown.whitelistLevel}</strong>}
                />
              )}
            </div>
          </div>
        )}

        {metadata.topRiskyCounterparties &&
          metadata.topRiskyCounterparties.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Топ контрагентов по притоку</span>
              <span className={styles.sectionDesc}>
                Адреса-отправители входящих стейблкоин-переводов с наибольшим объёмом и вкладом в риск. «Риск» здесь — пометка модели по известным данным и
                графу, а не юридический вердикт.
              </span>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <ThWithHint
                        title="Адрес"
                        hint="TRON-адрес контрагента (отправитель по входящему притоку)."
                      />
                      <ThWithHint
                        title="Объём"
                        hint="Сумма входящих USDT/USDC с этого адреса в выборке."
                      />
                      <ThWithHint
                        title="Оценка"
                        hint="Локальный AML-балл контрагента в нашей модели."
                      />
                      <ThWithHint
                        title="Тип сущности"
                        hint="Поведенческий класс (биржа, миксер и т.д.), если удалось определить."
                      />
                      <ThWithHint
                        title="Рисковый"
                        hint="Помечен как рисковый источник для заражённости притока."
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.topRiskyCounterparties.map(cp => (
                      <tr key={cp.address}>
                        <td className={styles.mono}>{cp.address}</td>
                        <td>{cp.incomingVolume.toFixed(2)}</td>
                        <td>{cp.riskScore.toFixed(2)}</td>
                        <td>{cp.entityType ?? '—'}</td>
                        <td>
                          <span className={cp.risky ? styles.badgeRisky : styles.badgeSafe}>
                            {cp.risky ? 'Да' : 'Нет'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        {metadata.sourceBreakdown && (
          <SourceBreakdown
            sourceBreakdown={metadata.sourceBreakdown}
            walletContext={metadata.walletContext}
          />
        )}
      </div>
    </ResultCard>
  );
}
