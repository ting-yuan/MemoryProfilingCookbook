// This simply defines the 'Debugger' constructor in this
// Scratchpad; it doesn't actually start debugging anything.
Components.utils.import('resource://gre/modules/jsdebugger.jsm');
addDebuggerToGlobal(window);

(function () {
  // The debugger we'll use to observe a tab's allocation.
  var dbg;

  // Start measuring the selected tab's main window's memory
  // consumption. This function is available in the browser
  // console.
  window.demoTrackAllocations = function() {
    dbg = new Debugger;

    // This makes hacking on the demo *much* more
    // pleasant.
    dbg.uncaughtExceptionHook = handleUncaughtException;

    // Find the current tab's main content window.
    var w = gBrowser.selectedBrowser.contentWindow;
    console.log("Tracking allocations in page: " +
                w.location.href);

    // Make that window a debuggee of our Debugger.
    dbg.addDebuggee(w.wrappedJSObject);

    // Enable allocation tracking in dbg's debuggees.
    dbg.memory.trackingAllocationSites = true;
  }

  window.demoPlotAllocations = function() {
    // Grab the allocation log.
    var log = dbg.memory.drainAllocationsLog();

    // Neutralize the Debugger, and drop it on the floor
    // for the GC to collect.
    console.log("Stopping allocation tracking.");
    dbg.removeAllDebuggees();
    dbg = undefined;

    // Analyze and display the allocation log.
    plot(log);
  }

  function handleUncaughtException(ex) {
    console.log('Debugger hook threw:');
    console.log(ex.toString());
    console.log('Stack:');
    console.log(ex.stack);
  };

  function plot(log) {
    // Given the log, compute a map from allocation sites to
    // allocation counts. Note that stack entries are '===' if
    // they represent the same site with the same callers.
    var counts = new Map;
    for (let site of log) {
      // This is a kludge, necessary for now. The saved stacks
      // are new, and Firefox doesn't yet understand that they
      // are safe for chrome code to use, so we must tell it
      // so explicitly.
      site = Components.utils.waiveXrays(site);

      if (!counts.has(site))
        counts.set(site, 0);
      counts.set(site, counts.get(site) + 1);
    }

    // Walk from each site that allocated something up to the
    // root, computing allocation totals that include
    // children. Remember that 'null' is a valid site,
    // representing the root.
    var totals = new Map;
    for (let [site, count] of counts) {
      for(;;) {
        if (!totals.has(site))
          totals.set(site, 0);
        totals.set(site, totals.get(site) + count);
        if (!site)
          break;
        site = site.parent;
      }
    }

    // Compute parent-to-child links, since saved stack frames
    // have only parent links.
    var rootChildren = new Map;
    function childMapFor(site) {
      if (!site)
        return rootChildren;

      let parentMap = childMapFor(site.parent);
      if (parentMap.has(site))
        return parentMap.get(site);

      var m = new Map;
      parentMap.set(site, m);
      return m;
    }
    for (let [site, total] of totals) {
      childMapFor(site);
    }

    // Print the allocation count for |site|. Print
    // |children|'s entries as |site|'s child nodes. Indent
    // the whole thing by |indent|.
    function walk(site, children, indent) {
      var name, place;
      if (site) {
        name = site.functionDisplayName;
        place = '  ' + site.source + ':' + site.line + ':' + site.column;
      } else {
        name = '(root)';
        place = '';
      }
      console.log(indent + totals.get(site) + ': ' + name + place);
      for (let [child, grandchildren] of children)
        walk(child, grandchildren, indent + '   ');
    }
    walk(null, rootChildren, '');
  }
})();
