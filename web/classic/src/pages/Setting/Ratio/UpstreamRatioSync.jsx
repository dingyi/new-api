/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  Spinner,
  Tooltip,
  useOverlayState,
} from '@heroui/react';
import {
  AlertTriangle,
  CheckCircle,
  CheckSquare,
  Inbox,
  RefreshCcw,
  Search,
} from 'lucide-react';
import {
  API,
  showError,
  showSuccess,
  showWarning,
  stringToColor,
} from '../../../helpers';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { DEFAULT_ENDPOINT } from '../../../constants';
import ChannelSelectorModal from '../../../components/settings/ChannelSelectorModal';

// ----------------------------- helpers -----------------------------

const inputClass =
  'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:opacity-50';

// All sync field keys the backend returns inside `differences[model]`.
// Order matters — UI surfaces fields in this exact order so the most
// important pricing rows appear first. Kept in sync with
// `controller/ratio_sync.go` `pricingSyncFields`.
const RATIO_FIELDS = [
  'model_ratio',
  'completion_ratio',
  'cache_ratio',
  'create_cache_ratio',
  'image_ratio',
  'audio_ratio',
  'audio_completion_ratio',
];
const SYNC_FIELD_ORDER = [
  ...RATIO_FIELDS,
  'model_price',
  'billing_mode',
  'billing_expr',
];

// Tiered fields are special: backend stores them under
// `billing_setting.{billing_mode,billing_expr}` and treats them as a paired
// alternative to ratio/price billing. See `getBillingCategory`.
const TIERED_FIELDS = new Set(['billing_mode', 'billing_expr']);

// Maps a `ratioType` field name to the Option key on the backend that
// `PUT /api/option/` expects when persisting the sync result. Most fields
// follow PascalCase (`model_ratio` -> `ModelRatio`); tiered fields are
// dotted under `billing_setting`.
function optionKeyFor(ratioType) {
  if (ratioType === 'billing_mode') return 'billing_setting.billing_mode';
  if (ratioType === 'billing_expr') return 'billing_setting.billing_expr';
  return ratioType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function StatusChip({ tone = 'grey', bg, color, prefixIcon, children }) {
  if (bg) {
    return (
      <span
        className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold'
        style={{ background: bg, color }}
      >
        {prefixIcon}
        <span>{children}</span>
      </span>
    );
  }
  const TONE = {
    green: 'bg-success/15 text-success',
    yellow: 'bg-warning/15 text-warning',
    blue: 'bg-primary/15 text-primary',
    grey: 'bg-surface-secondary text-muted',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        TONE[tone] || TONE.grey
      }`}
    >
      {prefixIcon}
      <span>{children}</span>
    </span>
  );
}

// Header / row checkbox supporting indeterminate state via DOM ref.
function CompactCheckbox({
  checked,
  indeterminate,
  onChange,
  children,
  ariaLabel,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <label className='inline-flex items-center gap-2 text-sm text-foreground'>
      <input
        ref={ref}
        type='checkbox'
        checked={!!checked}
        onChange={(event) => onChange?.(event.target.checked)}
        aria-label={ariaLabel}
        className='h-4 w-4 accent-primary'
      />
      {children ? <span>{children}</span> : null}
    </label>
  );
}

// ----------------------------- conflict modal -----------------------------

const OFFICIAL_RATIO_PRESET_ID = -100;
const OFFICIAL_RATIO_PRESET_NAME = '官方倍率预设';
const OFFICIAL_RATIO_PRESET_BASE_URL = 'https://basellm.github.io';
const OFFICIAL_RATIO_PRESET_ENDPOINT =
  '/llm-metadata/api/newapi/ratio_config-v1-base.json';
const MODELS_DEV_PRESET_ID = -101;
const MODELS_DEV_PRESET_NAME = 'models.dev 价格预设';
const MODELS_DEV_PRESET_BASE_URL = 'https://models.dev';
const MODELS_DEV_PRESET_ENDPOINT = 'https://models.dev/api.json';

function ConflictConfirmModal({ t, visible, items, onOk, onCancel }) {
  const isMobile = useIsMobile();
  const modalState = useOverlayState({
    isOpen: visible,
    onOpenChange: (isOpen) => {
      if (!isOpen) onCancel?.();
    },
  });

  return (
    <Modal state={modalState}>
      <ModalBackdrop variant='blur'>
        <ModalContainer
          size={isMobile ? 'full' : '4xl'}
          placement='center'
          className='max-w-[95vw]'
        >
          <ModalDialog className='bg-background/95 backdrop-blur'>
            <ModalHeader className='border-b border-border'>
              <span>{t('确认冲突项修改')}</span>
            </ModalHeader>
            <ModalBody className='px-6 py-5'>
              <div className='overflow-x-auto rounded-xl border border-border'>
                <table className='w-full text-sm'>
                  <thead className='bg-surface-secondary text-xs uppercase tracking-wide text-muted'>
                    <tr>
                      <th className='px-3 py-2 text-left font-medium'>
                        {t('渠道')}
                      </th>
                      <th className='px-3 py-2 text-left font-medium'>
                        {t('模型')}
                      </th>
                      <th className='px-3 py-2 text-left font-medium'>
                        {t('当前计费')}
                      </th>
                      <th className='px-3 py-2 text-left font-medium'>
                        {t('修改为')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-border'>
                    {items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className='px-4 py-8 text-center text-sm text-muted'
                        >
                          {t('暂无数据')}
                        </td>
                      </tr>
                    ) : (
                      items.map((row, idx) => (
                        <tr
                          key={idx}
                          className='bg-background hover:bg-surface-secondary/60'
                        >
                          <td className='px-3 py-2 align-top text-foreground'>
                            {row.channel}
                          </td>
                          <td className='px-3 py-2 align-top text-foreground'>
                            {row.model}
                          </td>
                          <td className='px-3 py-2 align-top whitespace-pre-wrap text-foreground'>
                            {row.current}
                          </td>
                          <td className='px-3 py-2 align-top whitespace-pre-wrap text-foreground'>
                            {row.newVal}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </ModalBody>
            <ModalFooter className='border-t border-border'>
              <Button variant='tertiary' onPress={onCancel}>
                {t('取消')}
              </Button>
              <Button color='primary' onPress={onOk}>
                {t('确认')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

// ----------------------------- main -----------------------------

export default function UpstreamRatioSync(props) {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const isMobile = useIsMobile();

  const [allChannels, setAllChannels] = useState([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState([]);

  const [channelEndpoints, setChannelEndpoints] = useState({});
  const [differences, setDifferences] = useState({});
  const [resolutions, setResolutions] = useState({});
  const [hasSynced, setHasSynced] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [ratioTypeFilter, setRatioTypeFilter] = useState('');

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [conflictItems, setConflictItems] = useState([]);

  const channelSelectorRef = useRef(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [ratioTypeFilter, searchKeyword]);

  const fetchAllChannels = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/ratio_sync/channels');
      if (res.data.success) {
        const channels = res.data.data || [];
        const transferData = channels.map((channel) => ({
          key: channel.id,
          label: channel.name,
          value: channel.id,
          disabled: false,
          _originalData: channel,
        }));
        setAllChannels(transferData);

        setChannelEndpoints((prev) => {
          const merged = { ...prev };
          transferData.forEach((channel) => {
            const id = channel.key;
            const base = channel._originalData?.base_url || '';
            const name = channel.label || '';
            const channelType = channel._originalData?.type;
            const isOfficialRatioPreset =
              id === OFFICIAL_RATIO_PRESET_ID ||
              base === OFFICIAL_RATIO_PRESET_BASE_URL ||
              name === OFFICIAL_RATIO_PRESET_NAME;
            const isModelsDevPreset =
              id === MODELS_DEV_PRESET_ID ||
              base === MODELS_DEV_PRESET_BASE_URL ||
              name === MODELS_DEV_PRESET_NAME;
            const isOpenRouter = channelType === 20;
            if (!merged[id]) {
              if (isModelsDevPreset) {
                merged[id] = MODELS_DEV_PRESET_ENDPOINT;
              } else if (isOfficialRatioPreset) {
                merged[id] = OFFICIAL_RATIO_PRESET_ENDPOINT;
              } else if (isOpenRouter) {
                merged[id] = 'openrouter';
              } else {
                merged[id] = DEFAULT_ENDPOINT;
              }
            }
          });
          return merged;
        });
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(t('获取渠道失败：') + error.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmChannelSelection = () => {
    const selected = allChannels
      .filter((ch) => selectedChannelIds.includes(ch.value))
      .map((ch) => ch._originalData);

    if (selected.length === 0) {
      showWarning(t('请至少选择一个渠道'));
      return;
    }

    setModalVisible(false);
    fetchRatiosFromChannels(selected);
  };

  const fetchRatiosFromChannels = async (channelList) => {
    setSyncLoading(true);

    const upstreams = channelList.map((ch) => ({
      id: ch.id,
      name: ch.name,
      base_url: ch.base_url,
      endpoint: channelEndpoints[ch.id] || DEFAULT_ENDPOINT,
    }));

    const payload = { upstreams, timeout: 10 };

    try {
      const res = await API.post('/api/ratio_sync/fetch', payload);
      if (!res.data.success) {
        showError(res.data.message || t('后端请求失败'));
        setSyncLoading(false);
        return;
      }

      const { differences = {}, test_results = [] } = res.data.data;

      const errorResults = test_results.filter((r) => r.status === 'error');
      if (errorResults.length > 0) {
        showWarning(
          t('部分渠道测试失败：') +
            errorResults.map((r) => `${r.name}: ${r.error}`).join(', '),
        );
      }

      setDifferences(differences);
      setResolutions({});
      setHasSynced(true);

      if (Object.keys(differences).length === 0) {
        showSuccess(t('未找到差异化倍率，无需同步'));
      }
    } catch (e) {
      showError(t('请求后端接口失败：') + e.message);
    } finally {
      setSyncLoading(false);
    }
  };

  // Three categories: `price` (single fixed price), `tiered` (expression
  // billing under `billing_setting.*`), and `ratio` (the standard
  // multi-field unit-cost flow). `tiered` is mutually exclusive with both
  // `price` and `ratio`; selecting a tiered field auto-pairs the other
  // tiered field from the same source. See `selectValue`.
  function getBillingCategory(ratioType) {
    if (ratioType === 'model_price') return 'price';
    if (TIERED_FIELDS.has(ratioType)) return 'tiered';
    return 'ratio';
  }

  // Resolve which sync field actually wins for a (model, ratioType, source)
  // selection. When the upstream ships a `billing_expr` for this model and
  // the user picked any non-expr field from the same source, prefer the
  // expression — it carries strictly more pricing information than a single
  // ratio cell. Mirrors upstream `getPreferredSyncField`.
  const getPreferredSyncField = useCallback(
    (modelDiffs, ratioType, sourceName) => {
      if (!modelDiffs || !sourceName) return ratioType;
      if (ratioType === 'billing_expr') return ratioType;
      const exprValue = modelDiffs.billing_expr?.upstreams?.[sourceName];
      if (
        exprValue !== null &&
        exprValue !== undefined &&
        exprValue !== 'same'
      ) {
        return 'billing_expr';
      }
      return ratioType;
    },
    [],
  );

  const selectValue = useCallback(
    (model, ratioType, value, sourceName) => {
      const modelDiffs = differences[model];
      const preferredType = getPreferredSyncField(
        modelDiffs,
        ratioType,
        sourceName,
      );
      const preferredValue =
        preferredType === ratioType
          ? value
          : (modelDiffs?.[preferredType]?.upstreams?.[sourceName] ?? value);
      const category = getBillingCategory(preferredType);

      setResolutions((prev) => {
        const newModelRes = { ...(prev[model] || {}) };
        // Tiered is mutually exclusive with price/ratio but tiered fields
        // pair with each other; conversely picking ratio/price clears
        // existing tiered selections. Mirror the same mutual-exclusion
        // rules upstream uses so apply-time conflict checks still hold.
        Object.keys(newModelRes).forEach((rt) => {
          const rtCategory = getBillingCategory(rt);
          if (category === 'tiered') {
            if (rtCategory !== 'tiered') delete newModelRes[rt];
          } else {
            if (rtCategory !== category) delete newModelRes[rt];
          }
        });
        newModelRes[preferredType] = preferredValue;

        // Auto-pair the partner tiered field from the same source so a
        // single click captures the full tiered config. If the source
        // didn't expose `billing_mode`, default to `tiered_expr` because
        // any user-selected expression implies the tiered mode.
        if (category === 'tiered' && sourceName && modelDiffs) {
          const modeVal = modelDiffs.billing_mode?.upstreams?.[sourceName];
          const exprVal = modelDiffs.billing_expr?.upstreams?.[sourceName];
          if (
            modeVal !== undefined &&
            modeVal !== null &&
            modeVal !== 'same'
          ) {
            newModelRes['billing_mode'] = modeVal;
          } else if (preferredType === 'billing_expr') {
            newModelRes['billing_mode'] = 'tiered_expr';
          }
          if (
            exprVal !== undefined &&
            exprVal !== null &&
            exprVal !== 'same'
          ) {
            newModelRes['billing_expr'] = exprVal;
          }
        }

        return { ...prev, [model]: newModelRes };
      });
    },
    [differences, getPreferredSyncField],
  );

  const performSync = useCallback(
    async (currentRatios) => {
      const finalRatios = {
        ModelRatio: { ...currentRatios.ModelRatio },
        CompletionRatio: { ...currentRatios.CompletionRatio },
        CacheRatio: { ...currentRatios.CacheRatio },
        CreateCacheRatio: { ...currentRatios.CreateCacheRatio },
        ImageRatio: { ...currentRatios.ImageRatio },
        AudioRatio: { ...currentRatios.AudioRatio },
        AudioCompletionRatio: { ...currentRatios.AudioCompletionRatio },
        ModelPrice: { ...currentRatios.ModelPrice },
        'billing_setting.billing_mode': {
          ...currentRatios['billing_setting.billing_mode'],
        },
        'billing_setting.billing_expr': {
          ...currentRatios['billing_setting.billing_expr'],
        },
      };

      Object.entries(resolutions).forEach(([model, ratios]) => {
        const selectedTypes = Object.keys(ratios);
        const hasPrice = selectedTypes.includes('model_price');
        const hasRatio = selectedTypes.some((rt) => RATIO_FIELDS.includes(rt));
        // Tiered selections coexist with neither side being deleted —
        // they live under `billing_setting.*` keys, so ratio/price keys
        // for the same model can stay around (and vice versa). Backend
        // chooses based on `billing_mode` at billing time.

        if (hasPrice) {
          // Picking a fixed price for a model invalidates every per-token
          // ratio for that same model — keep the option JSONs consistent
          // with upstream's `controller/option.go` semantics.
          delete finalRatios.ModelRatio[model];
          delete finalRatios.CompletionRatio[model];
          delete finalRatios.CacheRatio[model];
          delete finalRatios.CreateCacheRatio[model];
          delete finalRatios.ImageRatio[model];
          delete finalRatios.AudioRatio[model];
          delete finalRatios.AudioCompletionRatio[model];
        }
        if (hasRatio) {
          delete finalRatios.ModelPrice[model];
        }

        Object.entries(ratios).forEach(([ratioType, value]) => {
          const optionKey = optionKeyFor(ratioType);
          // billing_mode / billing_expr stay as strings; numeric ratios
          // and prices are normalised through `Number(...)` instead of
          // `parseFloat` so `0` and `0.0` survive without becoming `NaN`.
          finalRatios[optionKey][model] = TIERED_FIELDS.has(ratioType)
            ? value
            : Number(value);
        });
      });

      setLoading(true);
      try {
        const updates = Object.entries(finalRatios).map(([key, value]) =>
          API.put('/api/option/', {
            key,
            value: JSON.stringify(value, null, 2),
          }),
        );
        const results = await Promise.all(updates);
        if (results.every((res) => res.data.success)) {
          showSuccess(t('同步成功'));
          props.refresh();

          setDifferences((prevDifferences) => {
            const newDifferences = { ...prevDifferences };
            Object.entries(resolutions).forEach(([model, ratios]) => {
              Object.keys(ratios).forEach((ratioType) => {
                if (newDifferences[model] && newDifferences[model][ratioType]) {
                  delete newDifferences[model][ratioType];
                  if (Object.keys(newDifferences[model]).length === 0) {
                    delete newDifferences[model];
                  }
                }
              });
            });
            return newDifferences;
          });

          setResolutions({});
        } else {
          showError(t('部分保存失败'));
        }
      } catch (error) {
        showError(t('保存失败'));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolutions, props.options, props.refresh],
  );

  const applySync = async () => {
    // Best-effort JSON parse; falls back to {} so a malformed option (e.g.
    // not-yet-saved value) doesn't throw and abort the entire sync flow.
    const parseOption = (raw) => {
      try {
        return JSON.parse(raw || '{}');
      } catch {
        return {};
      }
    };
    const currentRatios = {
      ModelRatio: parseOption(props.options.ModelRatio),
      CompletionRatio: parseOption(props.options.CompletionRatio),
      CacheRatio: parseOption(props.options.CacheRatio),
      CreateCacheRatio: parseOption(props.options.CreateCacheRatio),
      ImageRatio: parseOption(props.options.ImageRatio),
      AudioRatio: parseOption(props.options.AudioRatio),
      AudioCompletionRatio: parseOption(props.options.AudioCompletionRatio),
      ModelPrice: parseOption(props.options.ModelPrice),
      'billing_setting.billing_mode': parseOption(
        props.options['billing_setting.billing_mode'],
      ),
      'billing_setting.billing_expr': parseOption(
        props.options['billing_setting.billing_expr'],
      ),
    };

    const conflicts = [];

    // The pre-apply conflict check only cares about price-vs-ratio swaps —
    // tiered always coexists, so we don't probe for it here.
    const getLocalBillingCategory = (model) => {
      if (currentRatios.ModelPrice[model] !== undefined) return 'price';
      if (
        RATIO_FIELDS.some(
          (rt) => currentRatios[optionKeyFor(rt)]?.[model] !== undefined,
        )
      ) {
        return 'ratio';
      }
      return null;
    };

    const findSourceChannel = (model, ratioType, value) => {
      if (differences[model] && differences[model][ratioType]) {
        const upMap = differences[model][ratioType].upstreams || {};
        const entry = Object.entries(upMap).find(([_, v]) => v === value);
        if (entry) return entry[0];
      }
      return t('未知');
    };

    Object.entries(resolutions).forEach(([model, ratios]) => {
      const localCat = getLocalBillingCategory(model);
      const selectedTypes = Object.keys(ratios);
      let newCat;
      if ('model_price' in ratios) {
        newCat = 'price';
      } else if (RATIO_FIELDS.some((rt) => selectedTypes.includes(rt))) {
        newCat = 'ratio';
      } else {
        newCat = 'tiered';
      }

      // Tiered overlays the existing pricing without replacing it, so it
      // doesn't trigger the price-vs-ratio swap warning even when the
      // model already has a local fixed price or ratio.
      if (localCat && newCat !== 'tiered' && localCat !== newCat) {
        const currentDesc =
          localCat === 'price'
            ? `${t('固定价格')} : ${currentRatios.ModelPrice[model]}`
            : `${t('模型倍率')} : ${currentRatios.ModelRatio[model] ?? '-'}\n${t('补全倍率')} : ${currentRatios.CompletionRatio[model] ?? '-'}`;

        let newDesc = '';
        if (newCat === 'price') {
          newDesc = `${t('固定价格')} : ${ratios['model_price']}`;
        } else {
          const newModelRatio = ratios['model_ratio'] ?? '-';
          const newCompRatio = ratios['completion_ratio'] ?? '-';
          newDesc = `${t('模型倍率')} : ${newModelRatio}\n${t('补全倍率')} : ${newCompRatio}`;
        }

        const channels = Object.entries(ratios)
          .map(([rt, val]) => findSourceChannel(model, rt, val))
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .join(', ');

        conflicts.push({
          channel: channels,
          model,
          current: currentDesc,
          newVal: newDesc,
        });
      }
    });

    if (conflicts.length > 0) {
      setConflictItems(conflicts);
      setConfirmVisible(true);
      return;
    }

    await performSync(currentRatios);
  };

  // ----------------------------- table -----------------------------

  const dataSource = useMemo(() => {
    const tmp = [];
    Object.entries(differences).forEach(([model, ratioTypes]) => {
      const hasPrice = 'model_price' in ratioTypes;
      const hasOtherRatio = RATIO_FIELDS.some((rt) => rt in ratioTypes);
      const billingConflict = hasPrice && hasOtherRatio;

      Object.entries(ratioTypes).forEach(([ratioType, diff]) => {
        tmp.push({
          key: `${model}_${ratioType}`,
          model,
          ratioType,
          current: diff.current,
          upstreams: diff.upstreams,
          confidence: diff.confidence || {},
          billingConflict,
        });
      });
    });
    return tmp;
  }, [differences]);

  const filteredDataSource = useMemo(() => {
    if (!searchKeyword.trim() && !ratioTypeFilter) return dataSource;
    return dataSource.filter((item) => {
      const matchesKeyword =
        !searchKeyword.trim() ||
        item.model.toLowerCase().includes(searchKeyword.toLowerCase().trim());
      const matchesRatioType =
        !ratioTypeFilter || item.ratioType === ratioTypeFilter;
      return matchesKeyword && matchesRatioType;
    });
  }, [dataSource, searchKeyword, ratioTypeFilter]);

  const upstreamNames = useMemo(() => {
    const set = new Set();
    filteredDataSource.forEach((row) => {
      Object.keys(row.upstreams || {}).forEach((name) => set.add(name));
    });
    return Array.from(set);
  }, [filteredDataSource]);

  const channelStatsMap = useMemo(() => {
    const map = {};
    upstreamNames.forEach((upName) => {
      let selectableCount = 0;
      let selectedCount = 0;
      filteredDataSource.forEach((row) => {
        const upstreamVal = row.upstreams?.[upName];
        if (
          upstreamVal !== null &&
          upstreamVal !== undefined &&
          upstreamVal !== 'same'
        ) {
          selectableCount++;
          if (resolutions[row.model]?.[row.ratioType] === upstreamVal) {
            selectedCount++;
          }
        }
      });
      map[upName] = {
        selectableCount,
        selectedCount,
        allSelected: selectableCount > 0 && selectedCount === selectableCount,
        partiallySelected: selectedCount > 0 && selectedCount < selectableCount,
        hasSelectableItems: selectableCount > 0,
      };
    });
    return map;
  }, [filteredDataSource, upstreamNames, resolutions]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredDataSource.length / pageSize),
  );
  const pageData = filteredDataSource.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const startIndex =
    filteredDataSource.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, filteredDataSource.length);

  const handleBulkSelect = (upName, checked) => {
    if (checked) {
      filteredDataSource.forEach((row) => {
        const upstreamVal = row.upstreams?.[upName];
        if (
          upstreamVal !== null &&
          upstreamVal !== undefined &&
          upstreamVal !== 'same'
        ) {
          // sourceName plumbed in so `selectValue` can run the
          // billing_expr-priority resolution against this upstream.
          selectValue(row.model, row.ratioType, upstreamVal, upName);
        }
      });
    } else {
      setResolutions((prev) => {
        const newRes = { ...prev };
        filteredDataSource.forEach((row) => {
          if (newRes[row.model]) {
            delete newRes[row.model][row.ratioType];
            if (Object.keys(newRes[row.model]).length === 0) {
              delete newRes[row.model];
            }
          }
        });
        return newRes;
      });
    }
  };

  const handleRowSelect = (model, ratioType, upstreamVal, checked, upName) => {
    if (checked) {
      selectValue(model, ratioType, upstreamVal, upName);
    } else {
      setResolutions((prev) => {
        const newRes = { ...prev };
        if (newRes[model]) {
          delete newRes[model][ratioType];
          if (Object.keys(newRes[model]).length === 0) {
            delete newRes[model];
          }
        }
        return newRes;
      });
    }
  };

  const updateChannelEndpoint = useCallback((channelId, endpoint) => {
    setChannelEndpoints((prev) => ({ ...prev, [channelId]: endpoint }));
  }, []);

  const handleModalClose = () => {
    setModalVisible(false);
    if (channelSelectorRef.current) {
      channelSelectorRef.current.resetPagination();
    }
  };

  const RATIO_TYPE_OPTIONS = [
    { value: '', label: t('按倍率类型筛选') },
    { value: 'model_ratio', label: t('模型倍率') },
    { value: 'completion_ratio', label: t('补全倍率') },
    { value: 'cache_ratio', label: t('缓存倍率') },
    { value: 'create_cache_ratio', label: t('创建缓存倍率') },
    { value: 'image_ratio', label: t('图像倍率') },
    { value: 'audio_ratio', label: t('音频倍率') },
    { value: 'audio_completion_ratio', label: t('音频补全倍率') },
    { value: 'model_price', label: t('固定价格') },
    { value: 'billing_expr', label: t('阶梯计费表达式') },
  ];

  const ratioTypeLabel = {
    model_ratio: t('模型倍率'),
    completion_ratio: t('补全倍率'),
    cache_ratio: t('缓存倍率'),
    create_cache_ratio: t('创建缓存倍率'),
    image_ratio: t('图像倍率'),
    audio_ratio: t('音频倍率'),
    audio_completion_ratio: t('音频补全倍率'),
    model_price: t('固定价格'),
    billing_mode: t('计费模式'),
    billing_expr: t('阶梯计费表达式'),
  };

  const renderEmpty = () => (
    <div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
      <Inbox size={36} className='text-muted/60' />
      <div className='text-sm text-muted'>
        {searchKeyword.trim()
          ? t('未找到匹配的模型')
          : Object.keys(differences).length === 0
            ? hasSynced
              ? t('暂无差异化倍率显示')
              : t('请先选择同步渠道')
            : t('请先选择同步渠道')}
      </div>
    </div>
  );

  const tableLoading = loading || syncLoading;
  const hasSelections = Object.keys(resolutions).length > 0;

  return (
    <>
      <div className='space-y-3'>
        {/* Toolbar */}
        <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
          <div className='flex w-full flex-col gap-2 md:w-auto md:flex-row'>
            <Button
              variant='tertiary'
              onPress={() => {
                setModalVisible(true);
                if (allChannels.length === 0) fetchAllChannels();
              }}
              className='w-full md:w-auto'
            >
              <RefreshCcw size={14} />
              {t('选择同步渠道')}
            </Button>
            <Button
              variant='tertiary'
              isDisabled={!hasSelections}
              onPress={applySync}
              className='w-full md:w-auto'
            >
              <CheckSquare size={14} />
              {t('应用同步')}
            </Button>

            <div className='flex w-full flex-col gap-2 sm:flex-row md:w-auto'>
              <div className='relative w-full sm:w-64'>
                <Search
                  size={14}
                  className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted'
                />
                <input
                  type='text'
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder={t('搜索模型名称')}
                  className={`${inputClass} pl-8`}
                />
              </div>
              <select
                value={ratioTypeFilter}
                onChange={(event) => setRatioTypeFilter(event.target.value)}
                className={`${inputClass} w-full sm:w-48`}
              >
                {RATIO_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className='relative overflow-x-auto rounded-xl border border-border'>
          {tableLoading && (
            <div className='absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]'>
              <Spinner color='primary' />
            </div>
          )}

          {filteredDataSource.length === 0 ? (
            renderEmpty()
          ) : (
            <table className='w-full text-sm'>
              <thead className='bg-surface-secondary text-xs uppercase tracking-wide text-muted'>
                <tr>
                  <th className='sticky left-0 bg-surface-secondary px-3 py-2 text-left font-medium'>
                    {t('模型')}
                  </th>
                  <th className='px-3 py-2 text-left font-medium'>
                    {t('倍率类型')}
                  </th>
                  <th className='px-3 py-2 text-left font-medium'>
                    {t('置信度')}
                  </th>
                  <th className='px-3 py-2 text-left font-medium'>
                    {t('当前值')}
                  </th>
                  {upstreamNames.map((upName) => {
                    const stats = channelStatsMap[upName] || {};
                    return (
                      <th
                        key={upName}
                        className='whitespace-nowrap px-3 py-2 text-left font-medium normal-case'
                      >
                        {stats.hasSelectableItems ? (
                          <CompactCheckbox
                            checked={!!stats.allSelected}
                            indeterminate={!!stats.partiallySelected}
                            onChange={(checked) =>
                              handleBulkSelect(upName, checked)
                            }
                            ariaLabel={upName}
                          >
                            {upName}
                          </CompactCheckbox>
                        ) : (
                          <span>{upName}</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className='divide-y divide-border'>
                {pageData.map((record) => {
                  const allConfident = Object.values(
                    record.confidence || {},
                  ).every((v) => v !== false);
                  const tagBg = stringToColor(record.ratioType) || undefined;
                  return (
                    <tr
                      key={record.key}
                      className='bg-background hover:bg-surface-secondary/60'
                    >
                      <td className='sticky left-0 bg-background px-3 py-2 align-top text-foreground'>
                        {record.model}
                      </td>
                      <td className='px-3 py-2 align-top'>
                        <div className='flex items-center gap-1'>
                          <StatusChip
                            bg={tagBg}
                            color={tagBg ? '#fff' : undefined}
                          >
                            {ratioTypeLabel[record.ratioType] ||
                              record.ratioType}
                          </StatusChip>
                          {record.billingConflict ? (
                            <Tooltip
                              content={t(
                                '该模型存在固定价格与倍率计费方式冲突，请确认选择',
                              )}
                            >
                              <AlertTriangle
                                size={14}
                                className='text-warning'
                              />
                            </Tooltip>
                          ) : null}
                        </div>
                      </td>
                      <td className='px-3 py-2 align-top'>
                        {allConfident ? (
                          <Tooltip content={t('所有上游数据均可信')}>
                            <StatusChip
                              tone='green'
                              prefixIcon={<CheckCircle size={12} />}
                            >
                              {t('可信')}
                            </StatusChip>
                          </Tooltip>
                        ) : (
                          (() => {
                            const untrustedSources = Object.entries(
                              record.confidence || {},
                            )
                              .filter(
                                ([_, isConfident]) => isConfident === false,
                              )
                              .map(([name]) => name)
                              .join(', ');
                            return (
                              <Tooltip
                                content={
                                  t('以下上游数据可能不可信：') +
                                  untrustedSources
                                }
                              >
                                <StatusChip
                                  tone='yellow'
                                  prefixIcon={<AlertTriangle size={12} />}
                                >
                                  {t('谨慎')}
                                </StatusChip>
                              </Tooltip>
                            );
                          })()
                        )}
                      </td>
                      <td className='px-3 py-2 align-top'>
                        <StatusChip
                          tone={
                            record.current !== null &&
                            record.current !== undefined
                              ? 'blue'
                              : 'grey'
                          }
                        >
                          {record.current !== null &&
                          record.current !== undefined
                            ? String(record.current)
                            : t('未设置')}
                        </StatusChip>
                      </td>
                      {upstreamNames.map((upName) => {
                        const upstreamVal = record.upstreams?.[upName];
                        const isConfident =
                          record.confidence?.[upName] !== false;

                        if (upstreamVal === null || upstreamVal === undefined) {
                          return (
                            <td key={upName} className='px-3 py-2 align-top'>
                              <StatusChip tone='grey'>{t('未设置')}</StatusChip>
                            </td>
                          );
                        }
                        if (upstreamVal === 'same') {
                          return (
                            <td key={upName} className='px-3 py-2 align-top'>
                              <StatusChip tone='blue'>
                                {t('与本地相同')}
                              </StatusChip>
                            </td>
                          );
                        }

                        const isSelected =
                          resolutions[record.model]?.[record.ratioType] ===
                          upstreamVal;

                        return (
                          <td key={upName} className='px-3 py-2 align-top'>
                            <div className='flex items-center gap-2'>
                              <CompactCheckbox
                                checked={isSelected}
                                onChange={(checked) =>
                                  handleRowSelect(
                                    record.model,
                                    record.ratioType,
                                    upstreamVal,
                                    checked,
                                    upName,
                                  )
                                }
                                ariaLabel={`${record.model} ${upName}`}
                              >
                                {String(upstreamVal)}
                              </CompactCheckbox>
                              {!isConfident && (
                                <Tooltip
                                  content={t('该数据可能不可信，请谨慎使用')}
                                >
                                  <AlertTriangle
                                    size={14}
                                    className='text-warning'
                                  />
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {filteredDataSource.length > 0 && (
            <div className='flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted'>
              <span>
                {t('共 {{total}} 项，当前显示 {{start}}-{{end}} 项', {
                  total: filteredDataSource.length,
                  start: startIndex,
                  end: endIndex,
                })}
              </span>
              <div className='flex items-center gap-2'>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setCurrentPage(1);
                  }}
                  className='h-8 rounded-xl border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary'
                >
                  {[5, 10, 20, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} / {t('页')}
                    </option>
                  ))}
                </select>
                <Button
                  size='sm'
                  variant='tertiary'
                  isDisabled={currentPage <= 1}
                  onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
                >
                  {t('上一页')}
                </Button>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size='sm'
                  variant='tertiary'
                  isDisabled={currentPage >= totalPages}
                  onPress={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                >
                  {t('下一页')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ChannelSelectorModal
        ref={channelSelectorRef}
        t={t}
        visible={modalVisible}
        onCancel={handleModalClose}
        onOk={confirmChannelSelection}
        allChannels={allChannels}
        selectedChannelIds={selectedChannelIds}
        setSelectedChannelIds={setSelectedChannelIds}
        channelEndpoints={channelEndpoints}
        updateChannelEndpoint={updateChannelEndpoint}
      />

      <ConflictConfirmModal
        t={t}
        visible={confirmVisible}
        items={conflictItems}
        onOk={async () => {
          setConfirmVisible(false);
          const curRatios = {
            ModelRatio: JSON.parse(props.options.ModelRatio || '{}'),
            CompletionRatio: JSON.parse(props.options.CompletionRatio || '{}'),
            CacheRatio: JSON.parse(props.options.CacheRatio || '{}'),
            ModelPrice: JSON.parse(props.options.ModelPrice || '{}'),
          };
          await performSync(curRatios);
        }}
        onCancel={() => setConfirmVisible(false)}
      />
    </>
  );
}
