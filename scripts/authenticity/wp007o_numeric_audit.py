"""Independent arithmetic on caller-supplied research rows; no data, models or public verdicts."""
import math

CONDITIONS = ("original", "jpeg95", "jpeg75", "resize75", "resize75_jpeg95")
Z95 = 1.959963984540054


def require(condition, code):
    if not condition:
        raise ValueError(code)


def number(value):
    require(type(value) in (int, float) and math.isfinite(value), 'NONFINITE_OR_NONNUMERIC')
    return float(value)


def probability(value):
    value = number(value)
    require(0 <= value <= 1, 'SCORE_OUT_OF_RANGE')
    return value


def wilson(successes, total):
    require(type(successes) is int and type(total) is int and 0 <= successes <= total, 'WILSON_COUNTS')
    if not total:
        return None
    p = successes / total
    z2 = Z95 * Z95
    denominator = 1 + z2 / total
    center = (p + z2 / (2 * total)) / denominator
    half = Z95 * math.sqrt(p * (1 - p) / total + z2 / (4 * total * total)) / denominator
    return [max(0.0, center - half), min(1.0, center + half)]


def ranking(labels, scores):
    require(len(labels) == len(scores), 'RANK_LENGTH')
    groups = {}
    for label, score in zip(labels, scores):
        require(type(label) is int and label in (0, 1), 'RANK_LABEL')
        score = probability(score)
        group = groups.setdefault(score, [0, 0])
        group[label] += 1
    positives = sum(labels)
    negatives = len(labels) - positives
    wins = 0.0
    negatives_below = 0
    for score in sorted(groups):
        n, p = groups[score]
        wins += p * (negatives_below + 0.5 * n)
        negatives_below += n
    auc = wins / (positives * negatives) if positives and negatives else None
    tp = fp = 0
    ap_terms = []
    for score in sorted(groups, reverse=True):
        n, p = groups[score]
        tp += p
        fp += n
        if positives:
            ap_terms.append((p / positives) * (tp / (tp + fp)))
    return auc, math.fsum(ap_terms) if positives else None


def metrics(rows, threshold, inclusive=False):
    threshold = number(threshold)
    labels = [r['label'] for r in rows]
    scores = [probability(r['score']) for r in rows]
    require(all(type(y) is int and y in (0, 1) for y in labels), 'METRIC_LABEL')
    predictions = [s >= threshold if inclusive else s > threshold for s in scores]
    tp = sum(y == 1 and pred for y, pred in zip(labels, predictions))
    fp = sum(y == 0 and pred for y, pred in zip(labels, predictions))
    pos = sum(labels)
    neg = len(labels) - pos
    fn, tn = pos - tp, neg - fp
    auc, ap = ranking(labels, scores)
    return {
        'N': len(rows), 'positives': pos, 'negatives': neg,
        'TP': tp, 'FP': fp, 'FN': fn, 'TN': tn,
        'recall': tp / pos if pos else None, 'FPR': fp / neg if neg else None,
        'precision': tp / (tp + fp) if tp + fp else None,
        'specificity': tn / neg if neg else None,
        'accuracy': (tp + tn) / len(rows) if rows else None,
        'F1': 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
        'AUROC': auc, 'AP': ap, 'FPRWilson95': wilson(fp, neg),
        'recallWilson95': wilson(tp, pos),
    }


def parent_scores(rows, mode):
    require(mode in ('max', 'min', 'adverse'), 'AGGREGATE_MODE')
    grouped = {}
    for row in rows:
        grouped.setdefault(row['sampleId'], []).append(row)
    out = []
    for parent_id in sorted(grouped):
        group = grouped[parent_id]
        require(len(group) == len(CONDITIONS) and {r['condition'] for r in group} == set(CONDITIONS), 'PARENT_CONDITIONS')
        labels = {r['label'] for r in group}
        require(len(labels) == 1, 'PARENT_LABEL_CONFLICT')
        label = next(iter(labels))
        take_max = mode == 'max' or (mode == 'adverse' and label == 0)
        score = (max if take_max else min)(probability(r['score']) for r in group)
        out.append(dict(group[0], score=score, condition='parent-' + mode))
    return out


def max_negative_threshold(rows, epsilon):
    epsilon = number(epsilon)
    require(epsilon > 0 and rows, 'CALIBRATION_EMPTY_OR_EPSILON')
    require(all(r['role'] == 'CALIBRATION_NEGATIVES' and r['label'] == 0 for r in rows), 'CALIBRATION_ROLE')
    worst = parent_scores(rows, 'max')
    maximum = max(r['score'] for r in worst)
    threshold = maximum + epsilon
    require(math.isfinite(threshold) and threshold > maximum, 'EPSILON_DOES_NOT_INCREASE_THRESHOLD')
    return threshold, {r['sampleId']: r['score'] for r in worst}


def group_metrics(rows, key, threshold, inclusive=False):
    groups = {}
    for row in rows:
        groups.setdefault(str(row[key]), []).append(row)
    return {key: metrics(groups[key], threshold, inclusive) for key in sorted(groups)}


def panels(rows, threshold, inclusive=False):
    primary = [r for r in rows if r['role'] in ('EVAL_NEGATIVES', 'EVAL_SYNTHETICS')]
    original = [r for r in primary if r['condition'] == 'original']
    worst = parent_scores(primary, 'max')
    result = {
        'original': metrics(original, threshold, inclusive),
        'descendantLevelDescriptive': metrics(primary, threshold, inclusive),
        'sourceWorst': metrics(worst, threshold, inclusive),
        'sourceAllConditions': metrics(parent_scores(primary, 'min'), threshold, inclusive),
        'performanceAdverseParent': metrics(parent_scores(primary, 'adverse'), threshold, inclusive),
        'byCondition': group_metrics(primary, 'condition', threshold, inclusive),
        'sourceWorstByKind': group_metrics(worst, 'kind', threshold, inclusive),
        'negativeSourceWorstByKind': group_metrics([r for r in worst if r['label'] == 0], 'kind', threshold, inclusive),
        'generatorOriginal': group_metrics([r for r in original if r['label'] == 1], 'generatorFamily', threshold, inclusive),
        'generatorConditions': {
            condition: group_metrics([r for r in primary if r['label'] == 1 and r['condition'] == condition], 'generatorFamily', threshold, inclusive)
            for condition in CONDITIONS
        },
        'historicalDiagnostic': group_metrics([r for r in rows if r['role'] == 'HISTORICAL_DIAGNOSTIC'], 'condition', threshold, inclusive),
    }
    return result


def safe_rescue(pe_rows, safe_rows, threshold, safe_threshold):
    pe = {(r['sampleId'], r['condition']): r for r in pe_rows if r['role'] in ('EVAL_NEGATIVES', 'EVAL_SYNTHETICS')}
    safe = {(r['sampleId'], r['condition']): r for r in safe_rows if r['role'] in ('EVAL_NEGATIVES', 'EVAL_SYNTHETICS')}
    require(len(pe) == sum(r['role'] in ('EVAL_NEGATIVES', 'EVAL_SYNTHETICS') for r in pe_rows), 'DUPLICATE_PE_JOIN')
    require(len(safe) == sum(r['role'] in ('EVAL_NEGATIVES', 'EVAL_SYNTHETICS') for r in safe_rows), 'DUPLICATE_SAFE_JOIN')
    require(set(pe) == set(safe), 'SAFE_JOIN_COVERAGE')
    joined = []
    for key in sorted(pe):
        row, other = pe[key], safe[key]
        for field in ('label', 'role', 'kind', 'generatorFamily', 'sourceFamilyId', 'sourceHash', 'decodedRgbSha256'):
            require(row[field] == other[field], 'SAFE_VIEW_OR_IDENTITY_MISMATCH')
        b0 = probability(row['score']) > threshold
        ref = probability(other['score']) >= safe_threshold
        joined.append(dict(row, B0positive=b0, SAFEpositive=ref,
                           uniqueRescue=bool(row['label'] == 1 and b0 and not ref),
                           inducedFP=bool(row['label'] == 0 and b0 and not ref)))
    groups = {}
    for condition in ('all',) + CONDITIONS:
        selected = [r for r in joined if condition == 'all' or r['condition'] == condition]
        rescued = sorted({r['sampleId'] for r in selected if r['uniqueRescue']})
        induced = sorted({r['sampleId'] for r in selected if r['inducedFP']})
        groups[condition] = {
            'distinctRescuedParents': len(rescued), 'rescuedParentIds': rescued,
            'extraFalsePositiveParents': len(induced), 'extraFPParentIds': induced,
            'rescuedFamilies': sorted({r['generatorFamily'] for r in selected if r['uniqueRescue']}),
        }
    parents = {}
    for row in joined:
        parents.setdefault(row['sampleId'], []).append(row)
    strict = sorted(k for k, rows in parents.items()
                    if rows[0]['label'] == 1 and any(r['B0positive'] for r in rows) and not any(r['SAFEpositive'] for r in rows))
    additional_fp = sorted(k for k, rows in parents.items()
                           if rows[0]['label'] == 0 and any(r['B0positive'] for r in rows) and not any(r['SAFEpositive'] for r in rows))
    return {
        'groups': groups,
        'sameConditionUnion': {
            'extraFalsePositiveParentIds': groups['all']['extraFPParentIds'],
            'rescuedParentIds': groups['all']['rescuedParentIds'],
        },
        'wholeParentSafeMissedRescueIds': strict,
        'wholeParentSafeMissedRescueCount': len(strict),
        'additionalFPSourceIdsRelativeSAFE': additional_fp,
        'additionalFPSourcesRelativeSAFE': len(additional_fp),
        'canonicalAdditionalFPDefinition': 'NEGATIVE_PARENTS_WITH_ANY_B0_POSITIVE_MINUS_NEGATIVE_PARENTS_WITH_ANY_SAFE_POSITIVE',
        'wholeParentRescueDefinition': 'POSITIVE_PARENTS_WITH_ANY_B0_POSITIVE_MINUS_POSITIVE_PARENTS_WITH_ANY_SAFE_POSITIVE',
        'semantics': 'Original groups remain matched-condition counts. Use additionalFPSourcesRelativeSAFE for additional FP sources relative SAFE.',
    }


def sigmoid(logit):
    logit = number(logit)
    if logit >= 0:
        return 1 / (1 + math.exp(-logit))
    e = math.exp(logit)
    return e / (1 + e)


def head_score(feature, head):
    require(len(feature) == 1024, 'FEATURE_DIMENSION')
    feature = [number(v) for v in feature]
    norm = math.sqrt(math.fsum(v * v for v in feature))
    require(norm > 0 and math.isfinite(norm), 'ZERO_OR_INVALID_FEATURE_NORM')
    for field in ('mean', 'scale', 'coefficient'):
        require(len(head[field]) == 1024, 'HEAD_DIMENSION')
    terms = []
    for value, mean, scale, coefficient in zip(feature, head['mean'], head['scale'], head['coefficient']):
        mean, scale, coefficient = number(mean), number(scale), number(coefficient)
        require(scale > 0, 'HEAD_SCALE')
        terms.append(((value / norm - mean) / scale) * coefficient)
    return sigmoid(math.fsum(terms) + number(head['intercept']))
