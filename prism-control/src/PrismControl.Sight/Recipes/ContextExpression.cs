using System.Globalization;

namespace PrismControl.Sight.Recipes;

/// <summary>What a context expression can ask about one detector's latest result.</summary>
public interface IDetectorFacts
{
    /// <summary>False when the detector has no result yet (never ran, or its region is off-frame).</summary>
    bool TryGet(string detectorId, out bool present, out string? label, out double? number, out double score);
}

/// <summary>
/// A tiny boolean language for context rules, over detector ids:
/// <c>builderTab &amp; !pauseMenu</c>, <c>tool=coaster | tool=track</c>, <c>excitementBar&gt;0 &amp; (a | b)</c>.
/// Operators: <c>!</c>, <c>&amp;</c>, <c>|</c>, parentheses; comparisons <c>= != &gt; &lt; &gt;= &lt;=</c> against a label or number.
/// A bare id is true when the detector says "present". The result carries a confidence: AND takes the minimum score,
/// OR the best true score, NOT keeps its operand's.
/// </summary>
public sealed class ContextExpression
{
    private readonly Node _root;

    private ContextExpression(Node root, IReadOnlyList<string> ids)
    {
        _root = root;
        DetectorIds = ids;
    }

    public IReadOnlyList<string> DetectorIds { get; }

    public static ContextExpression Parse(string text)
    {
        var p = new Parser(text ?? "");
        var node = p.ParseOr();
        p.SkipWs();
        if (!p.AtEnd) throw new FormatException($"unexpected '{p.Rest}' in \"{text}\"");
        return new ContextExpression(node, p.Ids.Distinct().ToList());
    }

    public (bool Value, double Confidence) Evaluate(IDetectorFacts facts) => _root.Eval(facts);

    private abstract class Node
    {
        public abstract (bool, double) Eval(IDetectorFacts f);
    }

    private sealed class Not(Node a) : Node
    {
        public override (bool, double) Eval(IDetectorFacts f) { var (v, c) = a.Eval(f); return (!v, c); }
    }

    private sealed class And(Node a, Node b) : Node
    {
        public override (bool, double) Eval(IDetectorFacts f)
        {
            var (va, ca) = a.Eval(f);
            var (vb, cb) = b.Eval(f);
            return (va && vb, Math.Min(ca, cb));
        }
    }

    private sealed class Or(Node a, Node b) : Node
    {
        public override (bool, double) Eval(IDetectorFacts f)
        {
            var (va, ca) = a.Eval(f);
            var (vb, cb) = b.Eval(f);
            if (va && vb) return (true, Math.Max(ca, cb));
            if (va) return (true, ca);
            if (vb) return (true, cb);
            return (false, Math.Min(ca, cb));
        }
    }

    private sealed class Term(string id, string? op, string? operand) : Node
    {
        public override (bool, double) Eval(IDetectorFacts f)
        {
            if (!f.TryGet(id, out var present, out var label, out var number, out var score)) return (false, 0);
            switch (op)
            {
                case null: return (present, score);
                case "=": return (present && string.Equals(label, operand, StringComparison.OrdinalIgnoreCase), score);
                case "!=": return (!(present && string.Equals(label, operand, StringComparison.OrdinalIgnoreCase)), score);
            }
            if (number is not { } n || !double.TryParse(operand, NumberStyles.Float, CultureInfo.InvariantCulture, out var k)) return (false, score);
            var v = op switch { ">" => n > k, "<" => n < k, ">=" => n >= k, "<=" => n <= k, _ => false };
            return (v, score);
        }
    }

    private sealed class Parser(string s)
    {
        private int _i;
        public readonly List<string> Ids = [];
        public bool AtEnd => _i >= s.Length;
        public string Rest => s[_i..];

        public void SkipWs() { while (_i < s.Length && char.IsWhiteSpace(s[_i])) _i++; }

        private bool Eat(char c)
        {
            SkipWs();
            if (_i < s.Length && s[_i] == c) { _i++; return true; }
            return false;
        }

        public Node ParseOr()
        {
            var a = ParseAnd();
            while (Eat('|')) a = new Or(a, ParseAnd());
            return a;
        }

        private Node ParseAnd()
        {
            var a = ParseUnary();
            while (Eat('&')) a = new And(a, ParseUnary());
            return a;
        }

        private Node ParseUnary()
        {
            SkipWs();
            if (_i < s.Length && s[_i] == '!' && !(_i + 1 < s.Length && s[_i + 1] == '='))
            {
                _i++;
                return new Not(ParseUnary());
            }
            if (Eat('('))
            {
                var e = ParseOr();
                if (!Eat(')')) throw new FormatException($"missing ')' in \"{s}\"");
                return e;
            }
            return ParseTerm();
        }

        private Node ParseTerm()
        {
            SkipWs();
            var start = _i;
            while (_i < s.Length && (char.IsLetterOrDigit(s[_i]) || s[_i] == '_' || (s[_i] == '.' && _i > start && _i + 1 < s.Length && char.IsLetterOrDigit(s[_i + 1])))) _i++;
            if (_i == start || !char.IsLetter(s[start])) throw new FormatException($"expected a detector id at '{Rest}' in \"{s}\"");
            var id = s[start.._i];
            Ids.Add(id);
            SkipWs();
            string? op = null;
            foreach (var cand in new[] { "!=", ">=", "<=", "=", ">", "<" })
            {
                if (string.CompareOrdinal(s, _i, cand, 0, cand.Length) == 0) { op = cand; _i += cand.Length; break; }
            }
            if (op is null) return new Term(id, null, null);
            SkipWs();
            var vs = _i;
            while (_i < s.Length && (char.IsLetterOrDigit(s[_i]) || s[_i] is '_' or '-' or '.' or '+')) _i++;
            if (_i == vs) throw new FormatException($"expected a value after '{op}' in \"{s}\"");
            return new Term(id, op, s[vs.._i]);
        }
    }
}
