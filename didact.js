// Transforms JSX into a plain object representing a UI element.
// Babel calls this function when it compiles JSX like <div id="app" />.
// `type` is the tag name ("div", "h1", etc.) or a component function.
// `props` holds attributes like { id: "app", className: "box" }.
// `...children` collects every nested element as a rest parameter array.
function createElement(type, props, ...children) {
    return {
        type,
        props: {
            ...props, // spread original props (e.g. id, className, event handlers)

            // Normalize children: if a child is already an element object, keep it;
            // if it's a primitive (string, number), wrap it in a TEXT_ELEMENT node.
            // This keeps the render function uniform — it always deals with objects.
            children: children.map(child =>
                typeof child === "object"
                    ? child
                    : createTextElement(child)
            ),
        },
    }
}

// Creates a virtual node for raw text content (strings and numbers).
// Real React just uses the primitive directly, but Didact wraps it in an object so that render() can handle every node the same way, without special-casing "is this a string or an element?".
// `nodeValue` is the actual DOM property that holds the text content assigning it to a text node is equivalent to node.nodeValue = "Hello".
function createTextElement(text) {
    return {
        type: "TEXT_ELEMENT", // sentinel type; render() checks for this string
        props: {
            nodeValue: text,    // will be assigned directly to the DOM text node
            children: [],       // text nodes never have children
        },
    }
}

let wipRoot = null
let currentRoot = null
let deletions = null

// Updated render: sets up the wipRoot instead of touching the DOM directly
function render(element, container) {
    wipRoot = {
        dom: container,
        props: { children: [element] },
        alternate: currentRoot,
    }
    deletions = []
    nextUnitOfWork = wipRoot
}

function commitRoot() {
    deletions.forEach(commitWork)
    commitWork(wipRoot.child)
    currentRoot = wipRoot
    wipRoot = null
}

function commitWork(fiber) {
    if (!fiber) return

    let domParentFiber = fiber.parent
    while (!domParentFiber.dom) {
        domParentFiber = domParentFiber.parent
    }
    const domParent = domParentFiber.dom

    if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
        domParent.appendChild(fiber.dom)
    } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
        updateDom(fiber.dom, fiber.alternate.props, fiber.props)
    } else if (fiber.effectTag === "DELETION") {
        commitDeletion(fiber, domParent)
    }

    commitWork(fiber.child)
    commitWork(fiber.sibling)
}

function commitDeletion(fiber, domParent) {
    if (fiber.dom) {
        domParent.removeChild(fiber.dom)
    } else {
        commitDeletion(fiber.child, domParent)
    }
}

let nextUnitOfWork = null

function workLoop(deadline) {
    let shouldYield = false
    while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
        shouldYield = deadline.timeRemaining() < 1
    }

    if (!nextUnitOfWork && wipRoot) {
        commitRoot()
    }

    requestIdleCallback(workLoop)
}

requestIdleCallback(workLoop)

function createDom(fiber) {
    const dom =
        fiber.type === "TEXT_ELEMENT"
            ? document.createTextNode("")
            : document.createElement(fiber.type)

    updateDom(dom, {}, fiber.props)
    return dom
}

function performUnitOfWork(fiber) {
    const isFunctionComponent = fiber.type instanceof Function
    if (isFunctionComponent) {
        updateFunctionComponent(fiber)
    } else {
        updateHostComponent(fiber)
    }

    // TODO: return the next unit of work following the order:
    // 1. Return the child, if it exists.
    // 2. Otherwise, walk up the tree looking for a sibling.
    // 3. If no sibling is found at any level, return undefined (we are done).

    if (fiber.child) {
        return fiber.child
    }

    let nextFiber = fiber
    while (nextFiber) {
        if (nextFiber.sibling) {
            return nextFiber.sibling
        }
        nextFiber = nextFiber.parent
    }

    return undefined
}

function updateHostComponent(fiber) {
    if (!fiber.dom) {
        fiber.dom = createDom(fiber)
    }
    reconcileChildren(fiber, fiber.props.children)
}

/*
const Didact = { createElement, render };

// We are not using JSX yet, so we write the nested calls manually
const element = Didact.createElement(
    "div",
    { style: "background: salmon; padding: 20px; border-radius: 8px;" },
    Didact.createElement("h1", null, "Mission 1: Success! 🎉"),
    Didact.createElement("p", null, "If you can see this, your DOM creation is working.")
);

const container = document.getElementById("root");
Didact.render(element, container);
*/

/* Let's simulate this tree:
      A
     / \
    B   D
   /
  C
*/

// 1. Create fake fibers
const fiberC = { type: "C", props: {} };
const fiberB = { type: "B", props: {}, child: fiberC };
const fiberD = { type: "D", props: {} };
const fiberA = { type: "A", props: {}, child: fiberB };

// 2. Link parents and siblings
fiberC.parent = fiberB;
fiberB.parent = fiberA;
fiberD.parent = fiberA;
fiberB.sibling = fiberD;

// 3. Temporarily mock the update function so it doesn't try to touch the DOM
const originalUpdateHost = updateHostComponent;
updateHostComponent = (fiber) => {
    console.log("Visiting node:", fiber.type);
};

// 4. Run your Work Loop logic manually
console.log("--- Starting Fiber Traversal Test ---");
let nextUnit = fiberA;
while (nextUnit) {
    nextUnit = performUnitOfWork(nextUnit);
}
console.log("--- Traversal Finished ---");

// Restore the original function for the next missions
updateHostComponent = originalUpdateHost;

const isEvent     = key => key.startsWith("on")
const isProperty  = key => key !== "children" && !isEvent(key)
const isNew       = (prev, next) => key => prev[key] !== next[key]
const isGone      = (prev, next) => key => !(key in next)

function updateDom(dom, prevProps, nextProps) {
    // TODO: implement the four cases described above
}

function reconcileChildren(wipFiber, elements) {
    let index = 0
    let oldFiber = wipFiber.alternate && wipFiber.alternate.child
    let prevSibling = null
    // Note: `deletions` is the global array declared in section 3.1.
    // Case 3 will push obsolete fibers into it so commitRoot() can remove them.

    while (index < elements.length || oldFiber != null) {
        const element = elements[index]
        let newFiber = null

        const sameType = oldFiber && element && element.type == oldFiber.type

        // TODO – Case 1: same type → UPDATE
        //   Performance win: The element type is the same, so we recycle the DOM node.
        //   Create a new fiber keeping the existing DOM node, copy the new props, and set the effectTag to "UPDATE".

        // TODO – Case 2: new element, different type → PLACEMENT
        //   Types differ (e.g., morphing an <h1> into a <span>), so we can't recycle.
        //   A new DOM node must be created from scratch.
        //   Create a new fiber with dom: null and set effectTag to "PLACEMENT".

        // TODO – Case 3: old fiber exists, different type → DELETION
        //   The old node is obsolete and must be cleared from the UI.
        //   We don't create a new fiber. Instead, set effectTag to "DELETION"
        //   on the oldFiber and push it to the `deletions` array.

        if (oldFiber) {
            oldFiber = oldFiber.sibling
        }

        if (index === 0) {
            wipFiber.child = newFiber
        } else if (element) {
            prevSibling.sibling = newFiber
        }

        prevSibling = newFiber
        index++
    }
}

const Didact = { createElement, render };
const container = document.getElementById("root");

function updateApp(title, description) {
    const element = Didact.createElement(
        "div",
        { style: "background: lightblue; padding: 20px; border-radius: 8px;" },
        Didact.createElement("h1", null, title),
        Didact.createElement("p", null, description)
    );
    Didact.render(element, container);
}

// 1. Test Initial Render (PLACEMENT)
updateApp("Mission 3: Fiber Tree works! 🌳", "Wait 2 seconds for the update...");

// 2. Test Reconciliation (UPDATE)
setTimeout(() => {
    updateApp("Mission 3: Reconciliation works! 🔄", "The DOM was updated without recreating the wrapper div.");
}, 2000);