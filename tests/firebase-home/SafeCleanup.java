package app.lovable.irth.acceptance.test;

/** Independent cleanup actions preserve primary failure and each other's execution. */
public final class SafeCleanup {
  private SafeCleanup() {}
  public interface Action { void run() throws Throwable; }
  private static Throwable retain(Throwable primary, Throwable later) {
    if(primary==null)return later;
    if(primary!=later)primary.addSuppressed(later);
    return primary;
  }
  public static void run(Action body, Action finish, Action restore) throws Throwable {
    Throwable failure=null;
    try { body.run(); } catch(Throwable error) { failure=error; }
    finally {
      try { finish.run(); } catch(Throwable error) { failure=retain(failure,error); }
      finally { try { restore.run(); } catch(Throwable error) { failure=retain(failure,error); } }
    }
    if(failure!=null)throw failure;
  }
}
