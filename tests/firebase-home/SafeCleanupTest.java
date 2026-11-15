package app.lovable.irth.acceptance.test;

/** Pure JVM negative tests; not Android/device acceptance. */
public final class SafeCleanupTest {
  private static void check(boolean ok){if(!ok)throw new AssertionError();}
  public static void main(String[] args) throws Throwable {
    for(int mask=0;mask<8;mask++){
      final int bits=mask;StringBuilder order=new StringBuilder();
      Throwable body=new Exception("body"),finish=new Exception("finish"),restore=new Exception("restore");
      Throwable received=null;
      try{SafeCleanup.run(()->{order.append('b');if((bits&1)!=0)throw body;},
        ()->{order.append('f');if((bits&2)!=0)throw finish;},
        ()->{order.append('r');if((bits&4)!=0)throw restore;});}catch(Throwable t){received=t;}
      check(order.toString().equals("bfr"));
      Throwable expected=(bits&1)!=0?body:(bits&2)!=0?finish:(bits&4)!=0?restore:null;
      check(received==expected);
      if(expected!=null)check(expected.getSuppressed().length==Integer.bitCount(bits)-1);
    }
    Throwable shared=new AssertionError("same object");
    try{SafeCleanup.run(()->{throw shared;},()->{throw shared;},()->{throw shared;});throw new AssertionError("expected");}
    catch(Throwable t){check(t==shared);check(t.getSuppressed().length==0);}
    System.out.println("SafeCleanup: 8 failure combinations + shared-error identity PASS");
  }
}
