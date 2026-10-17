using System.Reflection;
using System.Reflection.Emit;

namespace PrismControl.Ai.Tests;

/// <summary>
/// Walks the IL of every method in an assembly (compiler-generated async state machines and lambdas included) and reports
/// which top-level types call a given method. Used to prove structurally that only the Approve key reaches the allow path.
/// </summary>
public static class IlScan
{
    private static readonly Dictionary<short, OpCode> Codes = typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
        .Select(f => (OpCode)f.GetValue(null)!).ToDictionary(o => o.Value);

    public static IReadOnlySet<Type> CallersOf(Assembly assembly, MethodBase target)
    {
        var result = new HashSet<Type>();
        foreach (var type in assembly.GetTypes())
        {
            const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            IEnumerable<MethodBase> methods = type.GetMethods(all).Cast<MethodBase>().Concat(type.GetConstructors(all));
            foreach (var m in methods)
                if (Calls(m, target)) result.Add(Outermost(type));
        }
        return result;
    }

    private static Type Outermost(Type t)
    {
        while (t.DeclaringType is { } d) t = d;
        return t;
    }

    private static bool Calls(MethodBase m, MethodBase target)
    {
        byte[]? il;
        try { il = m.GetMethodBody()?.GetILAsByteArray(); }
        catch (Exception) { return false; }
        if (il is null) return false;
        var module = m.Module;
        var i = 0;
        while (i < il.Length)
        {
            OpCode op;
            if (il[i] == 0xFE && i + 1 < il.Length) { op = Codes[unchecked((short)(0xFE00 | il[i + 1]))]; i += 2; }
            else { op = Codes[il[i]]; i += 1; }
            switch (op.OperandType)
            {
                case OperandType.InlineMethod:
                {
                    var token = BitConverter.ToInt32(il, i);
                    try
                    {
                        var called = module.ResolveMethod(token, m.DeclaringType?.GetGenericArguments(), m.IsGenericMethod ? m.GetGenericArguments() : null);
                        if (called is not null && called.MetadataToken == target.MetadataToken && called.Module == target.Module) return true;
                    }
                    catch (ArgumentException) { }
                    i += 4;
                    break;
                }
                case OperandType.InlineNone: break;
                case OperandType.ShortInlineBrTarget:
                case OperandType.ShortInlineI:
                case OperandType.ShortInlineVar: i += 1; break;
                case OperandType.InlineVar: i += 2; break;
                case OperandType.InlineI8:
                case OperandType.InlineR: i += 8; break;
                case OperandType.InlineSwitch: i += 4 + BitConverter.ToInt32(il, i) * 4; break;
                default: i += 4; break;
            }
        }
        return false;
    }
}
